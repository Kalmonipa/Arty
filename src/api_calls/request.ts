import { ApiError, toApiError } from '../core/Error.js';
import { logger, MyHeaders, sleep as defaultSleep } from '../utils.js';
import { CharName } from '../constants.js';
import { apiRequestsCounter, rateLimitBackoffSeconds } from '../metrics.js';
import { classifyRequest } from './rateLimitBuckets.js';

/**
 * HTTP 429. ArtifactsMMO budgets requests per IP, so every character's
 * container on this host draws from one shared pool:
 *   data    10/s, 200/min, 2000/hour  (/my/bank/items, /items, /maps, ...)
 *   action  10/s, 100/min, 5000/hour  (/my/{name}/action/*)
 *   account 10/s,          300/hour
 * The hourly caps bind long before the per-second ones — five characters share
 * 2000 data requests an hour, so a single uncached full-bank scan loop can
 * starve the whole fleet.
 *
 * The API sends no Retry-After header, so we back off client-side.
 * See https://docs.artifactsmmo.com/api_guide/rate_limits/
 */
const RATE_LIMITED = 429;

interface RetryConfig {
  /** Number of times to retry a 429 before giving up. */
  maxRetries: number;
  /** Upper bound of the first retry's jitter window, in seconds; doubles each attempt. */
  baseDelaySeconds: number;
  /** Cap on a single backoff delay, in seconds. */
  maxDelaySeconds: number;
  /** Lower bound of every backoff delay, in seconds. */
  minDelaySeconds: number;
}

/**
 * Retries cost requests from the same per-IP budget that rejected us, so the
 * schedule is deliberately short: five attempts spanning at most ~93s. Beyond
 * that we're almost certainly against an hourly cap that no amount of waiting
 * inside one call will clear, and the caller retrying its job later is cheaper
 * than a character sitting blocked.
 */
const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 5,
  baseDelaySeconds: 3,
  maxDelaySeconds: 60,
  minDelaySeconds: 1,
};

export interface ApiRequestOptions<T = unknown> {
  url: string | URL;
  /** Defaults to GET. */
  method?: 'GET' | 'POST';
  /** Serialised to JSON and sent as the request body. Omit for GET. */
  body?: unknown;
  /** Human-readable messages for known non-OK HTTP statuses. */
  errorMessages?: Record<number, string>;
  /** Message used for non-OK statuses absent from `errorMessages`. */
  fallbackMessage?: string;
  /**
   * When true (default), sleep for the action cooldown returned in the
   * response body before resolving. No-op for endpoints with no cooldown.
   */
  awaitCooldown?: boolean;
  /**
   * Called with the parsed body after a successful response, before the
   * cooldown sleep. Use for per-action logging that should appear ahead of
   * the "Sleeping for N seconds" line, matching the pre-wrapper ordering.
   */
  onSuccess?: (body: T) => void;
  /** Overrides the default 429 backoff schedule. */
  retry?: Partial<RetryConfig>;
}

/** Test seam: lets tests substitute a no-op sleep so backoff doesn't slow them. */
export interface ApiRequestDeps {
  sleep: typeof defaultSleep;
}

interface CooldownBody {
  data: { cooldown: { remaining_seconds: number; reason: string } };
}

function hasCooldown(body: unknown): body is CooldownBody {
  const cooldown = (body as CooldownBody | undefined)?.data?.cooldown;
  return typeof cooldown?.remaining_seconds === 'number';
}

/**
 * Validation failures name the offending fields in the response body, e.g. a 422
 * carries `{"error":{"data":{"characters.1":["Input should be a valid dictionary"]}}}`.
 * Our per-status messages are generic, so without this the body's diagnosis is lost.
 */
async function fieldErrors(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const data = body?.error?.data;
    return data ? ` ${JSON.stringify(data)}` : '';
  } catch {
    return '';
  }
}

/**
 * Jittered backoff: pick a delay uniformly from [floor, window], where the
 * window grows exponentially per attempt and is capped at maxDelaySeconds.
 * Randomising across the window decorrelates retries from the account's other
 * characters, so a shared-budget 429 storm disperses instead of retrying in
 * lockstep.
 *
 * The floor matters as much as the jitter. Textbook full jitter draws from
 * [0, window], which at a 1s base made the first attempts round down to 0 and
 * retry instantly — five containers each firing three near-instant retries is
 * what turned a brief 429 into a sustained one. The budget we're waiting on is
 * per-IP and shared, so a retry that costs a request but cannot plausibly
 * succeed is pure damage.
 */
function backoffSeconds(attempt: number, retry: RetryConfig): number {
  const window = Math.min(
    retry.baseDelaySeconds * 2 ** attempt,
    retry.maxDelaySeconds,
  );
  const floor = Math.min(retry.minDelaySeconds, window);
  return Math.round(floor + Math.random() * (window - floor));
}

/**
 * Centralised wrapper around fetch for every ArtifactsMMO API call.
 *
 * Responsibilities pulled out of the ~50 hand-rolled call sites:
 *  - builds the request (method, auth headers, JSON body)
 *  - converts non-OK responses into ApiError with a per-endpoint message
 *  - normalises transport failures into ApiError (via toApiError) so callers'
 *    `instanceof ApiError` guards always hold
 *  - retries 429s with exponential backoff (the API has no per-call cooldown
 *    for these; the budget is global to the account)
 *  - sleeps for the action cooldown returned in the body
 *
 * Returns the parsed JSON body typed as T, or an ApiError. Callers extract
 * `.data` themselves, matching the existing call sites.
 */
export async function apiRequest<T>(
  options: ApiRequestOptions<T>,
  deps: ApiRequestDeps = { sleep: defaultSleep },
): Promise<T | ApiError> {
  const {
    url,
    method = 'GET',
    body,
    errorMessages = {},
    fallbackMessage,
    awaitCooldown = true,
    onSuccess,
  } = options;
  const retry = { ...DEFAULT_RETRY, ...options.retry };
  const { sleep } = deps;

  const requestOptions: RequestInit = {
    method,
    headers: MyHeaders,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  };

  const { bucket, endpoint } = classifyRequest(url, method);
  const labels = { character: CharName, bucket, endpoint };
  const record = (
    outcome: 'ok' | 'rate_limited' | 'error' | 'transport_error',
  ) => apiRequestsCounter.inc({ ...labels, outcome });

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, requestOptions);

      if (response.status === RATE_LIMITED) {
        record('rate_limited');
        if (attempt >= retry.maxRetries) {
          logger.error(
            `Rate limited (429) and out of retries for ${url.toString()}`,
          );
          return new ApiError({
            code: RATE_LIMITED,
            message: 'Rate limited; exhausted retries',
          });
        }
        const delay = backoffSeconds(attempt, retry);
        logger.error(
          `Rate limited (429); backing off ${delay}s (retry ${attempt + 1}/${retry.maxRetries})`,
        );
        rateLimitBackoffSeconds.inc(labels, delay);
        await sleep(delay, 'rate limit', false);
        continue;
      }

      if (!response.ok) {
        record('error');
        throw new ApiError({
          code: response.status,
          message:
            (errorMessages[response.status] ??
              fallbackMessage ??
              `Unknown error from ${url.toString()}`) +
            (await fieldErrors(response)),
        });
      }

      record('ok');

      const parsed = (await response.json()) as T;

      onSuccess?.(parsed);

      if (awaitCooldown && hasCooldown(parsed)) {
        await sleep(
          parsed.data.cooldown.remaining_seconds,
          parsed.data.cooldown.reason,
        );
      }

      return parsed;
    } catch (error) {
      // A non-OK response is raised as an ApiError above and already counted;
      // anything else never got an answer out of the API at all.
      if (!(error instanceof ApiError)) {
        record('transport_error');
      }
      return toApiError(error);
    }
  }
}
