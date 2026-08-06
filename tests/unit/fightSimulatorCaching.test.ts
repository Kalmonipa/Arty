import { jest } from '@jest/globals';

// fightSimulator owns its own apiRequest call, so there is no deps seam to pass
// a no-op sleep through. Without this the 429 case waits out the real backoff.
jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return { ...actual, sleep: jest.fn(async () => {}) };
});

import { fightSimulator } from '../../src/api_calls/Actions.js';
import { clearFightSimulationCache } from '../../src/core/fightSimulationCache.js';
import { fightSimulationCacheCounter, register } from '../../src/metrics.js';
import { ApiError } from '../../src/core/Error.js';
import { FakeCharacterSchema } from '../../src/types/types.js';

const loadout = (weapon = 'skull_wand'): FakeCharacterSchema =>
  ({ level: 34, weapon_slot: weapon }) as FakeCharacterSchema;

const simResponse = (winrate: number) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ data: { winrate, wins: 8, results: [] } }),
  }) as unknown as Response;

const cacheCounts = async (outcome: string): Promise<number> => {
  const { values } = await fightSimulationCacheCounter.get();
  return values
    .filter((v) => v.labels.outcome === outcome)
    .reduce((total, v) => total + v.value, 0);
};

describe('fightSimulator caching', () => {
  beforeEach(() => {
    clearFightSimulationCache();
    register.resetMetrics();
    jest.restoreAllMocks();
  });

  it('sends the first simulation of a payload to the API', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(simResponse(80));

    await fightSimulator([loadout()], 'skeleton', 10);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // The measured duplicate rate is 99%: one payload was sent 776 times in a day.
  it('answers a repeated payload without calling the API again', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(simResponse(80));

    const first = await fightSimulator([loadout()], 'skeleton', 10);
    const second = await fightSimulator([loadout()], 'skeleton', 10);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('re-simulates when a single equipment slot changes', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(simResponse(80));

    await fightSimulator([loadout('skull_wand')], 'skeleton', 10);
    await fightSimulator([loadout('wooden_club')], 'skeleton', 10);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('re-simulates for a different monster', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(simResponse(80));

    await fightSimulator([loadout()], 'skeleton', 10);
    await fightSimulator([loadout()], 'wolf', 10);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  // A rate-limited or failed simulation must not be remembered as a verdict.
  it('does not cache a failed simulation', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response);

    const failed = await fightSimulator([loadout()], 'skeleton', 10);
    expect(failed).toBeInstanceOf(ApiError);

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(simResponse(80));
    await fightSimulator([loadout()], 'skeleton', 10);

    expect(fetchSpy).toHaveBeenCalled();
  });

  it('reports hits and misses so the saving is visible in metrics', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(simResponse(80));

    await fightSimulator([loadout()], 'skeleton', 10);
    await fightSimulator([loadout()], 'skeleton', 10);
    await fightSimulator([loadout()], 'skeleton', 10);

    expect(await cacheCounts('miss')).toBe(1);
    expect(await cacheCounts('hit')).toBe(2);
  });
});
