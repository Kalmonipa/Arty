export class ApiError extends Error {
  error: {
    code: number;
    message: string;
  };

  constructor(error: { code: number; message: string }) {
    super(error.message);
    this.error = error;
    this.name = 'ApiError';
  }
}

/**
 * Sentinel code used for transport-level failures (network blips, dropped
 * connections, unparseable response bodies) that aren't HTTP status codes.
 */
export const TRANSPORT_ERROR_CODE = 599;

/**
 * Normalises any caught value into an ApiError.
 *
 * api_calls wrap their fetch logic in try/catch and intentionally throw
 * ApiError for non-2xx responses. But the catch also receives transport-level
 * failures (fetch rejecting on a network blip, response.json() throwing on a
 * bad body). Returning those raw defeats callers' `instanceof ApiError` guards,
 * which either crashes the process or silently fails a job. Wrapping them here
 * means every existing guard routes them through handleErrors instead.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError({
    code: TRANSPORT_ERROR_CODE,
    message:
      error instanceof Error
        ? error.message
        : `Unknown error: ${String(error)}`,
  });
}
