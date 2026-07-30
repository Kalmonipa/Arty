import { jest } from '@jest/globals';
import { Character } from '../../src/character/characterClass.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  AccountAchievementSchema,
  ConditionSchema,
  MapSchema,
} from '../../src/types/types.js';
import {
  NavigationGraph,
  TransitionEdge,
} from '../../src/core/navigation/graph.js';

// canSatisfyConditions only reaches the bank via getBankGold /
// checkQuantityOfItemInBank, which we stub on the instance — so the real Bank
// API is never called. The mock is a safety net.
jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionDepositGold: jest.fn(),
}));

describe('Character.canSatisfyConditions', () => {
  let character: Character;

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
    character.completedAchievements = [];
    character.data.gold = 0;
    character.getEquippedSlot = jest.fn(() => null);
    character.checkQuantityOfItemInInv = jest.fn(() => 0);
    character.checkQuantityOfItemInBank = jest.fn(async () => 0);
    (
      character as unknown as { getBankGold: () => Promise<number> }
    ).getBankGold = jest.fn(async () => 0);
  });

  it('returns true for empty, null, or undefined conditions', async () => {
    expect(await character.canSatisfyConditions([])).toBe(true);
    expect(await character.canSatisfyConditions(null)).toBe(true);
    expect(await character.canSatisfyConditions(undefined)).toBe(true);
  });

  it('achievement_unlocked: satisfied only when the achievement is completed', async () => {
    const cond: ConditionSchema[] = [
      { code: 'lich_slayer', operator: 'achievement_unlocked', value: 1 },
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(false);

    character.completedAchievements = [
      { code: 'lich_slayer' } as AccountAchievementSchema,
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(true);
  });

  it('has_item: satisfied by equipped, inventory, or bank', async () => {
    const cond: ConditionSchema[] = [
      { code: 'lich_tomb_key', operator: 'has_item', value: 1 },
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(false);

    character.getEquippedSlot = jest.fn(() => null);
    expect(await character.canSatisfyConditions(cond)).toBe(false);

    //character.getEquippedSlot = jest.fn(() => null);
    character.checkQuantityOfItemInInv = jest.fn((c) =>
      c === 'lich_tomb_key' ? 1 : 0,
    );
    expect(await character.canSatisfyConditions(cond)).toBe(true);

    character.checkQuantityOfItemInInv = jest.fn(() => 0);
    character.checkQuantityOfItemInBank = jest.fn(async (c) =>
      c === 'lich_tomb_key' ? 1 : 0,
    );
    expect(await character.canSatisfyConditions(cond)).toBe(true);
  });

  it('cost gold: affordable from on-hand plus bank gold', async () => {
    const cond: ConditionSchema[] = [
      { code: 'gold', operator: 'cost', value: 1000 },
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(false);

    character.data.gold = 1000;
    expect(await character.canSatisfyConditions(cond)).toBe(true);

    character.data.gold = 400;
    (
      character as unknown as { getBankGold: () => Promise<number> }
    ).getBankGold = jest.fn(async () => 600);
    expect(await character.canSatisfyConditions(cond)).toBe(true);

    (
      character as unknown as { getBankGold: () => Promise<number> }
    ).getBankGold = jest.fn(async () => 599);
    expect(await character.canSatisfyConditions(cond)).toBe(false);
  });

  it('cost item: affordable from inventory plus bank', async () => {
    const cond: ConditionSchema[] = [
      { code: 'tax_token', operator: 'cost', value: 3 },
    ];
    character.checkQuantityOfItemInInv = jest.fn((c) =>
      c === 'tax_token' ? 1 : 0,
    );
    character.checkQuantityOfItemInBank = jest.fn(async (c) =>
      c === 'tax_token' ? 1 : 0,
    );
    expect(await character.canSatisfyConditions(cond)).toBe(false); // 1 + 1 < 3

    character.checkQuantityOfItemInBank = jest.fn(async (c) =>
      c === 'tax_token' ? 2 : 0,
    );
    expect(await character.canSatisfyConditions(cond)).toBe(true); // 1 + 2 = 3
  });

  it('unknown operators (eq/ne/gt/lt) are treated as satisfiable', async () => {
    const cond: ConditionSchema[] = [
      { code: 'level', operator: 'gt', value: 30 },
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(true);
  });

  it('requires every condition to hold', async () => {
    character.completedAchievements = [
      { code: 'a' } as AccountAchievementSchema,
    ];
    const cond: ConditionSchema[] = [
      { code: 'a', operator: 'achievement_unlocked', value: 1 },
      { code: 'gold', operator: 'cost', value: 100 },
    ];
    expect(await character.canSatisfyConditions(cond)).toBe(false); // gold 0

    character.data.gold = 100;
    expect(await character.canSatisfyConditions(cond)).toBe(true);
  });
});

describe('Character.computeUnsatisfiableTransitions', () => {
  let character: Character;

  // Builds a transition-point map with optional conditions on its transition.
  function transitionPoint(
    mapId: number,
    conditions: ConditionSchema[] = [],
  ): MapSchema {
    return {
      map_id: mapId,
      name: `Map_${mapId}`,
      skin: 's',
      x: 0,
      y: 0,
      layer: 'overworld',
      access: { type: 'standard', conditions: [] },
      interactions: {
        transition: {
          map_id: 999,
          x: 0,
          y: 0,
          layer: 'underground',
          conditions,
        },
      },
    };
  }

  function graphWithEdges(points: MapSchema[]): NavigationGraph {
    const edges = new Map<number, TransitionEdge[]>();
    edges.set(
      0,
      points.map((p) => ({ fromZone: 0, toZone: 1, transitionPoint: p })),
    );
    return { zoneOfMapId: new Map(), zones: new Map(), edges };
  }

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
  });

  it('returns only the conditioned transitions the character cannot satisfy', async () => {
    const free = transitionPoint(10); // no conditions
    const gated = transitionPoint(11, [
      { code: 'lich_tomb_key', operator: 'cost', value: 1 },
    ]);
    const ok = transitionPoint(12, [
      { code: 'achv', operator: 'achievement_unlocked', value: 1 },
    ]);
    character.navigationGraph = graphWithEdges([free, gated, ok]);

    // Cannot satisfy the lich_tomb_key cost, can satisfy everything else.
    character.canSatisfyConditions = jest.fn(
      async (conditions: ConditionSchema[] | null | undefined) => {
        if (!conditions || conditions.length === 0) return true;
        return conditions[0].code !== 'lich_tomb_key';
      },
    );

    const result = await character.computeUnsatisfiableTransitions();
    expect([...result]).toEqual([11]);
  });

  it('returns an empty set when there are no conditioned transitions', async () => {
    character.navigationGraph = graphWithEdges([
      transitionPoint(10),
      transitionPoint(11),
    ]);
    character.canSatisfyConditions = jest.fn(async () => true);

    const result = await character.computeUnsatisfiableTransitions();
    expect(result.size).toBe(0);
  });
});

describe('Character.computeUnacquirableTransitions', () => {
  let character: Character;

  function tp(mapId: number, conditions: ConditionSchema[] = []): MapSchema {
    return {
      map_id: mapId,
      name: `Map_${mapId}`,
      skin: 's',
      x: 0,
      y: 0,
      layer: 'overworld',
      access: { type: 'standard', conditions: [] },
      interactions: {
        transition: {
          map_id: 999,
          x: 0,
          y: 0,
          layer: 'underground',
          conditions,
        },
      },
    };
  }

  function graphWithEdges(points: MapSchema[]): NavigationGraph {
    const edges = new Map<number, TransitionEdge[]>();
    edges.set(
      0,
      points.map((p) => ({ fromZone: 0, toZone: 1, transitionPoint: p })),
    );
    return { zoneOfMapId: new Map(), zones: new Map(), edges };
  }

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
    character.completedAchievements = [];
    character.data.gold = 0;
    character.getEquippedSlot = jest.fn(() => null);
    character.checkQuantityOfItemInInv = jest.fn(() => 0);
    character.checkQuantityOfItemInBank = jest.fn(async () => 0);
    (
      character as unknown as { getBankGold: () => Promise<number> }
    ).getBankGold = jest.fn(async () => 0);
  });

  it('marks unmet gold-cost and achievement gates unacquirable, but not item gates', async () => {
    const goldGate = tp(10, [{ code: 'gold', operator: 'cost', value: 1000 }]);
    const itemCostGate = tp(11, [
      { code: 'lich_tomb_key', operator: 'cost', value: 1 },
    ]);
    const hasItemGate = tp(12, [
      { code: 'guild_pass', operator: 'has_item', value: 1 },
    ]);
    const achievementGate = tp(13, [
      { code: 'champion', operator: 'achievement_unlocked', value: 1 },
    ]);
    character.navigationGraph = graphWithEdges([
      goldGate,
      itemCostGate,
      hasItemGate,
      achievementGate,
    ]);

    const result = await character.computeUnacquirableTransitions();
    // Item gates (11, 12) are acquirable; gold (10) and achievement (13) are not.
    expect([...result].sort((a, b) => a - b)).toEqual([10, 13]);
  });

  it('does not mark a gate whose conditions are already satisfiable', async () => {
    character.data.gold = 5000;
    const affordable = tp(10, [
      { code: 'gold', operator: 'cost', value: 1000 },
    ]);
    character.navigationGraph = graphWithEdges([affordable]);

    expect((await character.computeUnacquirableTransitions()).size).toBe(0);
  });
});
