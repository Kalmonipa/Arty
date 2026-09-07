import { jest } from '@jest/globals';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/Items', () => ({
  actionClaimPendingItems: jest.fn(),
  getAllItemInformation: jest.fn(),
  getPendingItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Monsters', () => ({
  getAllMonsterInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/NPC', () => ({
  getAllNpcItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources', () => ({
  getAllResourceInformation: jest.fn(),
}));

import { IdleObjective } from '../../src/idleObjectives/idleObjective.js';
import { IdleHealerObjective } from '../../src/idleObjectives/idleHealer.js';

const makeFood = (
  code: string,
  craftLevel: number,
  heal: number,
  ingredients: string[],
  outputPerCraft = 1,
): ItemSchema =>
  ({
    code,
    name: code,
    level: craftLevel,
    type: 'consumable',
    subtype: 'food',
    description: '',
    conditions: [],
    effects: [{ code: 'heal', value: heal, description: '' }],
    craft: {
      skill: 'cooking',
      level: craftLevel,
      items: ingredients.map((ingredient) => ({
        code: ingredient,
        quantity: 1,
      })),
      quantity: outputPerCraft,
    },
    tradeable: true,
  }) as unknown as ItemSchema;

const cookedBass = makeFood('cooked_bass', 30, 300, ['bass']);
const cookedSalmon = makeFood('cooked_salmon', 40, 400, ['salmon']);
const fishSoup = makeFood(
  'fish_soup',
  40,
  500,
  ['milk_bucket', 'salmon', 'trout'],
  3,
);

class MockCharacter {
  data: CharacterSchema = { ...mockCharacterData, inventory_max_items: 200 };

  jobList: unknown[] = [];

  consumablesMap: Record<string, ItemSchema[]> = {
    heal: [cookedBass, cookedSalmon, fishSoup],
  };

  utilitiesMap: Record<string, ItemSchema[]> = { restore: [], antipoison: [] };

  fishingDropCodes = new Set(['bass', 'salmon', 'trout']);

  allCharacterDetails: CharacterSchema[] = [];

  highestCharLevel = 46;

  lowestCharLevel = 37;

  getCharacterLevel = jest.fn((): number => 49);

  checkQuantityOfItemInBank = jest.fn(
    async (_code: string): Promise<number> => 0,
  );

  craftNow = jest.fn(
    async (_quantity: number, _code: string): Promise<ObjectiveResult> =>
      ObjectiveCompleted,
  );

  gatherNow = jest.fn(
    async (_quantity: number, _code: string): Promise<ObjectiveResult> =>
      ObjectiveCompleted,
  );

  depositNow = jest.fn(
    async (): Promise<ObjectiveResult> => ObjectiveCompleted,
  );

  saveJobQueue = jest.fn(async (): Promise<void> => {});
}

describe('IdleObjective.topUpBank as a fisherman', () => {
  it('cooks the food that heals the most first', async () => {
    const mockCharacter = new MockCharacter();
    const objective = new IdleObjective(mockCharacter as any, 'fisherman');

    await (objective as any).topUpBank();

    expect(mockCharacter.craftNow.mock.calls.map((call) => call[1])).toEqual([
      'fish_soup',
      'cooked_salmon',
      'cooked_bass',
    ]);
  });
});

describe('IdleHealerObjective.topUpFishInBank', () => {
  it('fishes for the raw ingredient of the best food first', async () => {
    const mockCharacter = new MockCharacter();
    const objective = new IdleHealerObjective(mockCharacter as any);

    await (objective as any).topUpFishInBank();

    expect(mockCharacter.gatherNow.mock.calls.map((call) => call[1])).toEqual([
      'salmon',
      'bass',
    ]);
  });
});
