import {
  CombatSimulationResponseSchema,
  FakeCharacterSchema,
} from '../types/types.js';

/**
 * @description A memo of fight simulation results, keyed on the exact request.
 *
 * The simulator is asked the same question over and over: across a day of logs,
 * 6,266 simulations resolved to 62 distinct payloads, one of which was sent 776
 * times. Each repeat costs a request against a 1/s bucket plus its round trip,
 * so the loop spends hours waiting to be told what it already knows.
 *
 * Caching a stochastic result is safe here because the key pins down everything
 * the outcome depends on — monster, iteration count, and every character's
 * level and equipment. A level-up or a gear change mints a new key on its own,
 * so entries cannot go stale; they only become unreachable, which is what the
 * size bound is for.
 */
const results = new Map<string, CombatSimulationResponseSchema>();

/**
 * Generous next to the 62 distinct payloads a day actually produces, but bounded
 * so a long-running process that levels repeatedly cannot grow without limit.
 */
export const FIGHT_SIMULATION_CACHE_LIMIT = 500;

/**
 * Loadouts are assembled by several different code paths, so property insertion
 * order varies between payloads that are otherwise identical. Sorting the keys
 * means those still collapse onto one entry instead of silently missing.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalise(entry)]),
    );
  }
  return value;
}

export function fightSimulationKey(
  characters: FakeCharacterSchema[],
  monsterCode: string,
  iterations: number,
): string {
  return JSON.stringify(
    canonicalise({ characters, monster: monsterCode, iterations }),
  );
}

export function readCachedFightSimulation(
  key: string,
): CombatSimulationResponseSchema | undefined {
  return results.get(key);
}

export function cacheFightSimulation(
  key: string,
  result: CombatSimulationResponseSchema,
): void {
  if (results.size >= FIGHT_SIMULATION_CACHE_LIMIT) {
    const oldest = results.keys().next().value;
    if (oldest !== undefined) {
      results.delete(oldest);
    }
  }
  results.set(key, result);
}

/** Test seam: drop every entry so each test starts from a clean simulation. */
export function clearFightSimulationCache(): void {
  results.clear();
}
