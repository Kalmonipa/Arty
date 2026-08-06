/**
 * Maps a request onto the rate-limit bucket the API charges it to, so we can
 * count our own consumption against the published per-IP budgets.
 *
 * Buckets and their limits (per IP, shared by every character on this host):
 *   account     10/s,          300/hour
 *   data        10/s, 200/min, 2000/hour
 *   action      10/s, 100/min, 5000/hour
 *   simulation   1/s
 *
 * See https://docs.artifactsmmo.com/api_guide/rate_limits/
 */
export type RateLimitBucket = 'account' | 'data' | 'action' | 'simulation';

export interface RequestClassification {
  bucket: RateLimitBucket;
  /**
   * The path with character names and item codes collapsed to placeholders.
   * Used as a metric label, so it has to stay low-cardinality — a raw path
   * would mint a new time series per item code we ever look up.
   */
  endpoint: string;
}

/** Paths the API bills to the account bucket regardless of shape. */
const ACCOUNT_PATHS = new Set([
  '/accounts/create',
  '/accounts/forgot_password',
  '/accounts/reset_password',
  '/characters/create',
  '/characters/delete',
  '/token',
  '/my/change_password',
  '/my/change_email',
  '/my/buy_subscription',
  '/my/subscribe/cancel',
  '/my/buy_gems',
  '/my/rates',
  '/gems_shop/skin',
  '/gems_shop/spawn_event',
  '/gems_shop/subscription',
  '/game_assistant/ask',
]);

/**
 * Collections whose next path segment is a code or name rather than a
 * sub-resource, e.g. /items/copper_ore or /monsters/chicken.
 */
const CODE_ADDRESSED = new Set([
  'items',
  'monsters',
  'resources',
  'maps',
  'npcs',
  'tasks',
  'achievements',
  'effects',
  'badges',
  'events',
]);

const ACTION_PATH = /^\/my\/[^/]+\/action\//;

function normalisePath(path: string): string {
  if (ACTION_PATH.test(path)) {
    return path.replace(/^\/my\/[^/]+\//, '/my/{name}/');
  }

  const segments = path.split('/').filter(Boolean);

  if (segments.length === 2) {
    const [collection] = segments;
    if (collection === 'characters') {
      return '/characters/{name}';
    }
    if (CODE_ADDRESSED.has(collection)) {
      return `/${collection}/{code}`;
    }
  }

  return path;
}

/**
 * `GET /my/rates` is an account request while `GET /my/bank` is a data one, and
 * `POST /characters/create` is an account write while `GET /characters/{name}`
 * is a data read — so the method matters as much as the path.
 */
export function classifyRequest(
  url: string | URL,
  method: string,
): RequestClassification {
  const path = (typeof url === 'string' ? new URL(url) : url).pathname.replace(
    /\/$/,
    '',
  );
  const endpoint = normalisePath(path) || '/';

  if (path === '/simulation/fight') {
    return { bucket: 'simulation', endpoint };
  }

  if (ACTION_PATH.test(path) || path.startsWith('/sandbox/')) {
    return { bucket: 'action', endpoint };
  }

  // The account paths that collide with a data read are all writes.
  if (ACCOUNT_PATHS.has(path) && (method === 'POST' || path === '/my/rates')) {
    return { bucket: 'account', endpoint };
  }

  return { bucket: 'data', endpoint };
}
