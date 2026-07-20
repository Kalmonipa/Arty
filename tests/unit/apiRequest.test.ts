import { jest } from '@jest/globals';
import { apiRequest } from '../../src/api_calls/request.js';
import { ApiError } from '../../src/core/Error.js';

// A no-op sleep so the rate-limit backoff and cooldown waits don't slow tests.
const makeSleep = () =>
  jest.fn<
    (seconds: number, reason: string, shouldLog?: boolean) => Promise<void>
  >(async () => {});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('apiRequest', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the parsed body on a 2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: { name: 'item' } }));

    const result = await apiRequest<{ data: { name: string } }>(
      { url: 'https://api/items/item' },
      { sleep: makeSleep() },
    );

    expect(result).toEqual({ data: { name: 'item' } });
  });

  it('sends the body as JSON for POST requests', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: {} }));

    await apiRequest(
      { url: 'https://api/action/fight', method: 'POST', body: ['ally1'] },
      { sleep: makeSleep() },
    );

    const init = fetchSpy.mock.calls[0][1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify(['ally1']));
  });

  it('maps a known non-OK status to its configured message', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(478, {}));

    const result = await apiRequest(
      {
        url: 'https://api/action/use',
        errorMessages: { 478: 'Missing item or insufficient quantity.' },
      },
      { sleep: makeSleep() },
    );

    expect(result).toBeInstanceOf(ApiError);
    expect((result as ApiError).error.code).toBe(478);
    expect((result as ApiError).error.message).toBe(
      'Missing item or insufficient quantity.',
    );
  });

  it('falls back to a generic message for unmapped non-OK statuses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(503, {}));

    const result = await apiRequest(
      {
        url: 'https://api/items',
        fallbackMessage: 'Unknown error from /items',
      },
      { sleep: makeSleep() },
    );

    expect(result).toBeInstanceOf(ApiError);
    expect((result as ApiError).error.code).toBe(503);
    expect((result as ApiError).error.message).toBe(
      'Unknown error from /items',
    );
  });

  it('returns an ApiError when fetch throws a transport error', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    const result = await apiRequest(
      { url: 'https://api/items' },
      { sleep: makeSleep() },
    );

    expect(result).toBeInstanceOf(ApiError);
  });

  it('sleeps for the action cooldown after a successful action', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: { cooldown: { remaining_seconds: 25, reason: 'fight' } },
      }),
    );
    const sleep = makeSleep();

    await apiRequest(
      { url: 'https://api/action/fight', method: 'POST' },
      { sleep },
    );

    expect(sleep).toHaveBeenCalledWith(25, 'fight');
  });

  it('does not try to sleep when the body has no cooldown', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: [{ name: 'a' }] }));
    const sleep = makeSleep();

    await apiRequest({ url: 'https://api/items' }, { sleep });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('calls onSuccess with the body before sleeping for the cooldown', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: { cooldown: { remaining_seconds: 25, reason: 'fight' } },
      }),
    );
    const calls: string[] = [];
    const sleep = jest.fn<() => Promise<void>>(async () => {
      calls.push('sleep');
    });

    await apiRequest(
      {
        url: 'https://api/action/fight',
        method: 'POST',
        onSuccess: () => calls.push('onSuccess'),
      },
      { sleep },
    );

    expect(calls).toEqual(['onSuccess', 'sleep']);
  });

  describe('429 rate limiting', () => {
    it('retries after backing off and then succeeds', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
      const sleep = makeSleep();

      const result = await apiRequest<{ data: { ok: boolean } }>(
        {
          url: 'https://api/action/fight',
          method: 'POST',
          retry: { maxRetries: 5 },
        },
        { sleep },
      );

      expect(result).toEqual({ data: { ok: true } });
      // Two 429s => two backoff sleeps, all tagged as rate limit.
      const rateLimitSleeps = sleep.mock.calls.filter(
        ([, reason]) => reason === 'rate limit',
      );
      expect(rateLimitSleeps).toHaveLength(2);
    });

    it('gives up after exhausting retries and returns a 429 ApiError', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(429, {}));
      const sleep = makeSleep();

      const result = await apiRequest(
        {
          url: 'https://api/action/fight',
          method: 'POST',
          retry: { maxRetries: 2 },
        },
        { sleep },
      );

      expect(result).toBeInstanceOf(ApiError);
      expect((result as ApiError).error.code).toBe(429);
    });

    const rateLimitDelays = (sleep: ReturnType<typeof makeSleep>): number[] =>
      sleep.mock.calls
        .filter(([, reason]) => reason === 'rate limit')
        .map(([seconds]) => seconds);

    it('grows the jitter window exponentially each attempt', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(429, {}));
      // Max jitter makes each delay equal to the full window for that attempt.
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const sleep = makeSleep();

      await apiRequest(
        {
          url: 'https://api/action/fight',
          method: 'POST',
          retry: { maxRetries: 4, baseDelaySeconds: 1, maxDelaySeconds: 60 },
        },
        { sleep },
      );

      expect(rateLimitDelays(sleep)).toEqual([1, 2, 4, 8]);
    });

    it('uses full jitter, so a delay can be as low as 0', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(jsonResponse(429, {}))
        .mockResolvedValueOnce(jsonResponse(200, { data: {} }));
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const sleep = makeSleep();

      await apiRequest(
        {
          url: 'https://api/action/fight',
          method: 'POST',
          retry: { baseDelaySeconds: 10 },
        },
        { sleep },
      );

      expect(rateLimitDelays(sleep)[0]).toBe(0);
    });

    it('never sleeps longer than the cap, even at maximum jitter', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(429, {}));
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const sleep = makeSleep();

      await apiRequest(
        {
          url: 'https://api/action/fight',
          method: 'POST',
          retry: { maxRetries: 8, baseDelaySeconds: 10, maxDelaySeconds: 60 },
        },
        { sleep },
      );

      const delays = rateLimitDelays(sleep);
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(60);
      }
      expect(Math.max(...delays)).toBe(60);
    });

    it('defaults to base 1s, a 60s cap, and 10 retries', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(429, {}));
      jest.spyOn(Math, 'random').mockReturnValue(1);
      const sleep = makeSleep();

      await apiRequest(
        { url: 'https://api/action/fight', method: 'POST' },
        { sleep },
      );

      const delays = rateLimitDelays(sleep);
      expect(delays).toHaveLength(10);
      expect(delays[0]).toBe(1);
      expect(Math.max(...delays)).toBe(60);
    });
  });
});
