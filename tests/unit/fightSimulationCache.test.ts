import {
  cacheFightSimulation,
  clearFightSimulationCache,
  fightSimulationKey,
  readCachedFightSimulation,
  FIGHT_SIMULATION_CACHE_LIMIT,
} from '../../src/core/fightSimulationCache.js';
import {
  CombatSimulationResponseSchema,
  FakeCharacterSchema,
} from '../../src/types/types.js';

const loadout = (
  overrides: Partial<FakeCharacterSchema> = {},
): FakeCharacterSchema =>
  ({
    level: 34,
    weapon_slot: 'skull_wand',
    shield_slot: 'iron_shield',
    ...overrides,
  }) as FakeCharacterSchema;

const result = (winrate: number): CombatSimulationResponseSchema =>
  ({
    data: { winrate, wins: 8, results: [] },
  }) as CombatSimulationResponseSchema;

describe('fightSimulationKey', () => {
  it('matches identical requests', () => {
    expect(fightSimulationKey([loadout()], 'skeleton', 10)).toBe(
      fightSimulationKey([loadout()], 'skeleton', 10),
    );
  });

  it('separates requests that differ only by monster', () => {
    expect(fightSimulationKey([loadout()], 'skeleton', 10)).not.toBe(
      fightSimulationKey([loadout()], 'wolf', 10),
    );
  });

  it('separates requests that differ only by iteration count', () => {
    expect(fightSimulationKey([loadout()], 'skeleton', 10)).not.toBe(
      fightSimulationKey([loadout()], 'skeleton', 20),
    );
  });

  it('separates requests that differ by a single equipment slot', () => {
    expect(fightSimulationKey([loadout()], 'skeleton', 10)).not.toBe(
      fightSimulationKey(
        [loadout({ weapon_slot: 'wooden_club' })],
        'skeleton',
        10,
      ),
    );
  });

  // Level is part of the payload, so a level-up naturally invalidates without
  // anyone having to remember to clear the cache.
  it('separates requests that differ only by character level', () => {
    expect(fightSimulationKey([loadout()], 'skeleton', 10)).not.toBe(
      fightSimulationKey([loadout({ level: 35 })], 'skeleton', 10),
    );
  });

  // Loadouts are built by different code paths, so relying on JSON property
  // order would silently miss on payloads that are actually identical.
  it('ignores the order properties were assigned in', () => {
    const assignedOneWay = { level: 34, weapon_slot: 'skull_wand' };
    const assignedAnother = { weapon_slot: 'skull_wand', level: 34 };

    expect(
      fightSimulationKey([assignedOneWay as FakeCharacterSchema], 'wolf', 10),
    ).toBe(
      fightSimulationKey([assignedAnother as FakeCharacterSchema], 'wolf', 10),
    );
  });

  it('distinguishes a party from a single character', () => {
    expect(fightSimulationKey([loadout()], 'wolf', 10)).not.toBe(
      fightSimulationKey([loadout(), loadout()], 'wolf', 10),
    );
  });
});

describe('fight simulation cache', () => {
  beforeEach(() => clearFightSimulationCache());

  it('returns nothing for a payload never simulated', () => {
    const key = fightSimulationKey([loadout()], 'skeleton', 10);

    expect(readCachedFightSimulation(key)).toBeUndefined();
  });

  it('returns the stored result for a repeated payload', () => {
    const key = fightSimulationKey([loadout()], 'skeleton', 10);
    cacheFightSimulation(key, result(80));

    expect(readCachedFightSimulation(key)?.data.winrate).toBe(80);
  });

  it('evicts the oldest entry once the size bound is reached', () => {
    const first = fightSimulationKey([loadout()], 'monster_0', 10);
    cacheFightSimulation(first, result(50));

    for (let i = 1; i <= FIGHT_SIMULATION_CACHE_LIMIT; i++) {
      cacheFightSimulation(
        fightSimulationKey([loadout()], `monster_${i}`, 10),
        result(50),
      );
    }

    expect(readCachedFightSimulation(first)).toBeUndefined();
  });
});
