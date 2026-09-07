import { jest } from '@jest/globals';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/Items', () => ({
  actionClaimPendingItems: jest.fn(),
  getPendingItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources', () => ({
  getAllResourceInformation: jest.fn(),
}));

import { IdleFishermanObjective } from '../../src/idleObjectives/idleFisherman.js';

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

  role = 'fisherman';

  jobList: unknown[] = [];

  consumablesMap: Record<string, ItemSchema[]> = {
    heal: [cookedBass, cookedSalmon, fishSoup],
  };

  fishingDropCodes = new Set(['bass', 'salmon', 'trout']);

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

  saveJobQueue = jest.fn(async (): Promise<void> => {});
}

describe('IdleFishermanObjective.topUpBank', () => {
  let mockCharacter: MockCharacter;
  let objective: IdleFishermanObjective;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCharacter = new MockCharacter();
    objective = new IdleFishermanObjective(mockCharacter as any);
  });

  it('tops the bank up to 500 of each fish food', async () => {
    await (objective as any).topUpBank();

    for (const call of mockCharacter.craftNow.mock.calls) {
      expect(call[0]).toBe(500);
    }
  });

  it('cooks the food that heals the most first', async () => {
    await (objective as any).topUpBank();

    expect(mockCharacter.craftNow.mock.calls.map((call) => call[1])).toEqual([
      'fish_soup',
      'cooked_salmon',
      'cooked_bass',
    ]);
  });

  it('only makes up the shortfall for food already part stocked', async () => {
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'fish_soup' ? 320 : 0),
    );

    await (objective as any).topUpBank();

    expect(mockCharacter.craftNow).toHaveBeenCalledWith(180, 'fish_soup');
  });
});

describe('IdleFishermanObjective.gatherExtraFish', () => {
  let mockCharacter: MockCharacter;
  let objective: IdleFishermanObjective;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCharacter = new MockCharacter();
    objective = new IdleFishermanObjective(mockCharacter as any);
  });

  it('leaves alone the food that is already at target', async () => {
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'fish_soup' ? 500 : 0),
    );

    await (objective as any).gatherExtraFish();

    expect(mockCharacter.craftNow.mock.calls.map((call) => call[1])).toEqual([
      'cooked_salmon',
      'cooked_bass',
    ]);
  });

  it('cooks an inventory load of food that is short', async () => {
    await (objective as any).gatherExtraFish();

    expect(mockCharacter.craftNow).toHaveBeenCalledWith(190, 'fish_soup');
  });

  it('never cooks past the target', async () => {
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'fish_soup' ? 450 : 0),
    );

    await (objective as any).gatherExtraFish();

    expect(mockCharacter.craftNow).toHaveBeenCalledWith(50, 'fish_soup');
  });
});
