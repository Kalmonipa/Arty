import { jest } from '@jest/globals';
import { Character } from '../../src/core/Character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  AccountAchievementSchema,
  ConditionSchema,
} from '../../src/types/types.js';

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
    character.hasEquipped = jest.fn(() => false);
    character.checkQuantityOfItemInInv = jest.fn(() => 0);
    character.checkQuantityOfItemInBank = jest.fn(async () => 0);
    (character as unknown as { getBankGold: () => Promise<number> }).getBankGold =
      jest.fn(async () => 0);
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

    character.hasEquipped = jest.fn((c) => c === 'lich_tomb_key');
    expect(await character.canSatisfyConditions(cond)).toBe(true);

    character.hasEquipped = jest.fn(() => false);
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
