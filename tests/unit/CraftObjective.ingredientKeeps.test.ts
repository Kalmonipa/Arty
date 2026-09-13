import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(async (code: string) => ITEMS[code]),
}));

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionCraft: jest.fn(),
}));

jest.mock('../../src/events/events.cache.js', () => ({
  eventBlockedIngredients: jest.fn(async () => []),
}));

import { CraftObjective } from '../../src/core/CraftObjective.js';
import { actionCraft } from '../../src/api_calls/Actions.js';
import { ApiError } from '../../src/core/Error.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import { ItemSchema, MapSchema } from '../../src/types/types.js';

const ITEMS: Record<string, Partial<ItemSchema>> = {
  maple_syrup: {
    code: 'maple_syrup',
    craft: {
      skill: 'cooking',
      level: 40,
      quantity: 2,
      items: [{ code: 'maple_sap', quantity: 2 }],
    } as any,
  },
};

const workshop = {
  map_id: 325,
  name: 'City',
  x: 1,
  y: 1,
} as unknown as MapSchema;

const makeCharacter = () => {
  const character: any = {
    data: { name: 'BouncyBella', inventory_max_items: 217, x: 1, y: 1 },
    role: 'labourer',
    jobList: [],
    itemsToKeep: [] as string[],
    enableEvents: false,
    checkQuantityOfItemInInv: jest.fn(() => 100),
    checkQuantityOfItemInBank: jest.fn(async () => 0),
    findMaps: jest.fn(() => [workshop]),
    evaluateClosestMap: jest.fn(() => workshop),
    move: jest.fn(async () => true),
    handleErrors: jest.fn(async () => false),
    saveJobQueue: jest.fn(async () => undefined),
    checkForBossFightParticipation: jest.fn(async () => undefined),
  };

  character.addItemToItemsToKeep = jest.fn((code: string) => {
    if (character.itemsToKeep.includes(code)) return false;
    character.itemsToKeep.push(code);
    return true;
  });
  character.removeItemFromItemsToKeep = jest.fn((code: string) => {
    const index = character.itemsToKeep.indexOf(code);
    if (index >= 0) character.itemsToKeep.splice(index, 1);
  });
  return character;
};

const runCraft = async (character: any) => {
  const job = new CraftObjective(
    character,
    { code: 'maple_syrup', quantity: 100 },
    false,
    false,
  );
  jest
    .spyOn(job as any, 'gatherIngredients')
    .mockResolvedValue(ObjectiveCompleted as never);
  jest
    .spyOn(job as any, 'carryFinishedItems')
    .mockResolvedValue(undefined as never);
  return job.run();
};

describe('CraftObjective ingredient keeps', () => {
  beforeEach(() => jest.clearAllMocks());

  it('releases kept ingredients when the craft itself fails', async () => {
    // Bella collected 100 maple_sap, the craft failed on skill level, and the
    // sap stayed on the keep list. Every later deposit then refused to bank it,
    // so she could never free the space for her next task and spun in a
    // withdraw/deposit loop for an hour.
    const character = makeCharacter();
    (actionCraft as jest.Mock).mockResolvedValue(
      new ApiError({
        code: 493,
        message: 'The characters skill level is too low.',
      }) as never,
    );

    const result = await runCraft(character);

    expect(result.success).toBe(false);
    expect(character.itemsToKeep).toEqual([]);
  });

  it('leaves keeps this job did not add alone', async () => {
    const character = makeCharacter();
    character.itemsToKeep.push('maple_sap');
    (actionCraft as jest.Mock).mockResolvedValue(
      new ApiError({
        code: 493,
        message: 'The characters skill level is too low.',
      }) as never,
    );

    await runCraft(character);

    expect(character.itemsToKeep).toEqual(['maple_sap']);
  });
});
