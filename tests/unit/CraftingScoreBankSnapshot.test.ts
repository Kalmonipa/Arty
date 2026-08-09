import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getAllItemInformation: jest.fn(),
  getItemInformation: jest.fn(),
}));

import { getItemInformation } from '../../src/api_calls/Items.js';
import { calculateBestCraftingItem } from '../../src/core/TrainCraftingSkillObjective.js';
import { BankCache } from '../../src/core/BankCache.js';
import { Character } from '../../src/character/CharacterClass.js';
import { ItemSchema } from '../../src/types/types.js';

const mobDrop = (code: string): ItemSchema =>
  ({
    code,
    name: code,
    level: 1,
    type: 'resource',
    subtype: 'mob',
  }) as ItemSchema;

const craftable = (code: string, ingredients: string[]): ItemSchema =>
  ({
    code,
    name: code,
    level: 10,
    type: 'weapon',
    subtype: 'weapon',
    craft: { items: ingredients.map((c) => ({ code: c, quantity: 1 })) },
  }) as ItemSchema;

describe('crafting score reuses the caller bank snapshot', () => {
  it('gives every mob-drop ingredient the same snapshot, not its own', async () => {
    const proposeCombatLoadout = jest.fn<
      (mob: string, cache?: BankCache) => Promise<object>
    >(async () => ({}));
    const character = {
      data: { name: 'LongLegLarry' },
      getAllBankItems: jest.fn(async () => []),
      monsterData: [
        {
          code: 'chicken',
          name: 'chicken',
          type: 'normal',
          drops: [{ code: 'feather', rate: 10 }],
        },
        {
          code: 'cow',
          name: 'cow',
          type: 'normal',
          drops: [{ code: 'cowhide', rate: 10 }],
        },
      ],
      proposeCombatLoadout,
      simulateFightNow: jest.fn(async () => true),
    } as unknown as Character;

    jest
      .mocked(getItemInformation)
      .mockImplementation(async (code: string) => mobDrop(code));

    const snapshot = BankCache.fromItems([{ code: 'copper_ore', quantity: 3 }]);

    await calculateBestCraftingItem(
      character,
      [
        craftable('wooden_club', ['feather', 'cowhide']),
        craftable('copper_dagger', ['feather', 'cowhide']),
      ],
      snapshot,
    );

    // Two distinct mob drops shared across two candidates, each costed once for
    // the pass. The bank holds none of them, so both are actually fought for.
    // A proposal without a snapshot builds its own — two paginated requests
    // apiece — against a fleet-wide budget of 2000 data requests an hour.
    expect(proposeCombatLoadout).toHaveBeenCalledTimes(2);
    for (const call of proposeCombatLoadout.mock.calls) {
      expect(call[1]).toBe(snapshot);
    }
  });

  it('passes the shared snapshot into every loadout proposal', async () => {
    const proposeCombatLoadout = jest.fn<
      (mob: string, cache?: BankCache) => Promise<object>
    >(async () => ({}));
    const character = {
      data: { name: 'LongLegLarry' },
      getAllBankItems: jest.fn(async () => []),
      monsterData: [
        {
          code: 'chicken',
          name: 'chicken',
          type: 'normal',
          drops: [{ code: 'feather', rate: 10 }],
        },
      ],
      proposeCombatLoadout,
      simulateFightNow: jest.fn(async () => true),
    } as unknown as Character;

    jest
      .mocked(getItemInformation)
      .mockImplementation(async (code: string) => mobDrop(code));

    const snapshot = BankCache.fromItems([{ code: 'copper_ore', quantity: 3 }]);

    await calculateBestCraftingItem(
      character,
      [craftable('wooden_club', ['feather'])],
      snapshot,
    );

    expect(proposeCombatLoadout).toHaveBeenCalledWith('chicken', snapshot);
  });
});
