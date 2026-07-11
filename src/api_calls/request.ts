import { ApiError, toApiError } from '../core/Error.js';
import { logger, MyHeaders, sleep as defaultSleep } from '../utils.js';

/**
 * HTTP 429. ArtifactsMMO enforces a per-account request budget shared across
 * all of an account's characters (action: 20/2s, data: 20/s, account: 10/s).
 * The API does not send a Retry-After header, so we back off client-side.
 * See https://docs.artifactsmmo.com/api_guide/rate_limits/
 */
const RATE_LIMITED = 429;

interface RetryConfig {
  /** Number of times to retry a 429 before giving up. */
  maxRetries: number;
  /** Delay before the first retry, in seconds; doubles each attempt. */
  baseDelaySeconds: number;
  /** Cap on a single backoff delay, in seconds. */
  maxDelaySeconds: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 5,
  baseDelaySeconds: 5,
  maxDelaySeconds: 60,
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

/** Exponential backoff with up to +100% jitter, capped at maxDelaySeconds. */
function backoffSeconds(attempt: number, retry: RetryConfig): number {
  const exponential = Math.min(
    retry.baseDelaySeconds * 2 ** attempt,
    retry.maxDelaySeconds,
  );
  const jitter = Math.random() * exponential;
  return Math.round(exponential + jitter);
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

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, requestOptions);

      if (response.status === RATE_LIMITED) {
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
        await sleep(delay, 'rate limit', false);
        continue;
      }

      if (!response.ok) {
        throw new ApiError({
          code: response.status,
          message:
            errorMessages[response.status] ??
            fallbackMessage ??
            `Unknown error from ${url.toString()}`,
        });
      }

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
      return toApiError(error);
    }
  }
}
