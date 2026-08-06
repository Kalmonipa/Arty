import { jest } from '@jest/globals';
import { apiRequest } from '../../src/api_calls/request.js';
import { apiRequestsCounter, register } from '../../src/metrics.js';

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

const countsFor = async (
  match: Partial<Record<string, string>>,
): Promise<number> => {
  const { values } = await apiRequestsCounter.get();
  return values
    .filter((v) =>
      Object.entries(match).every(([key, value]) => v.labels[key] === value),
    )
    .reduce((total, v) => total + v.value, 0);
};

describe('apiRequest rate-limit metrics', () => {
  beforeEach(() => register.resetMetrics());
  afterEach(() => jest.restoreAllMocks());

  it('counts a successful call against its bucket and endpoint', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: [] }));

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/my/bank/items?size=100' },
      { sleep: makeSleep() },
    );

    expect(
      await countsFor({
        bucket: 'data',
        endpoint: '/my/bank/items',
        outcome: 'ok',
      }),
    ).toBe(1);
  });

  it('bills a character action to the action bucket', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: {} }));

    await apiRequest(
      {
        url: 'https://api.artifactsmmo.com/my/ZippyZoe/action/gathering',
        method: 'POST',
      },
      { sleep: makeSleep() },
    );

    expect(await countsFor({ bucket: 'action', outcome: 'ok' })).toBe(1);
  });

  // Retries spend from the same budget that rejected us, so counting one per
  // apiRequest call would under-report exactly when it matters most.
  it('counts every retry attempt, not just the call', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/my/bank/items' },
      { sleep: makeSleep() },
    );

    expect(await countsFor({ outcome: 'rate_limited' })).toBe(2);
    expect(await countsFor({ outcome: 'ok' })).toBe(1);
    expect(await countsFor({ endpoint: '/my/bank/items' })).toBe(3);
  });

  it('counts a non-429 failure as an error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(498, {}));

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/characters/TimidTom' },
      { sleep: makeSleep() },
    );

    expect(
      await countsFor({ endpoint: '/characters/{name}', outcome: 'error' }),
    ).toBe(1);
  });

  it('counts a dropped connection separately from an API error', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/my/bank/items' },
      { sleep: makeSleep() },
    );

    expect(await countsFor({ outcome: 'transport_error' })).toBe(1);
  });

  // A non-OK response is raised as an ApiError inside the same try block that
  // catches transport failures, so the two paths must not both record it.
  it('records an API error exactly once despite the throw', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(498, {}));

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/characters/TimidTom' },
      { sleep: makeSleep() },
    );

    expect(await countsFor({ endpoint: '/characters/{name}' })).toBe(1);
  });

  it('records how long rate limiting kept the character waiting', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    jest.spyOn(Math, 'random').mockReturnValue(1);

    await apiRequest(
      { url: 'https://api.artifactsmmo.com/my/bank/items' },
      { sleep: makeSleep() },
    );

    const { values } = await (
      await import('../../src/metrics.js')
    ).rateLimitBackoffSeconds.get();
    const total = values.reduce((sum, v) => sum + v.value, 0);

    // One 429 at full jitter on the default 3s base.
    expect(total).toBe(3);
  });
});
