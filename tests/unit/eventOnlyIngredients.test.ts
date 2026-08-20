import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources.js', () => ({
  getResourceNodesDropping: jest.fn(async () => []),
}));

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionCraft: jest.fn(),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  getOpenWishlistRequests: jest.fn(),
  claimWishlistRequest: jest.fn(async () => true),
  markAsFulfilled: jest.fn(async () => true),
  markAsNotExecuting: jest.fn(async () => true),
}));

import * as fs from 'node:fs/promises';
import { getItemInformation } from '../../src/api_calls/Items.js';
import { actionCraft } from '../../src/api_calls/Actions.js';
import { getOpenWishlistRequests } from '../../src/wishlist/wishlist.utils.js';
import { clearEventContentCache } from '../../src/events/events.cache.js';
import { CraftObjective } from '../../src/core/CraftObjective.js';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import { IdentifyValidWishlistRequestsObjective } from '../../src/wishlist/identifyValidWishlistRequests.objective.js';
import { Character } from '../../src/character/character.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  EventSchema,
  ItemSchema,
  MapSchema,
  MonsterSchema,
} from '../../src/types/types.js';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockedGetItem = getItemInformation as jest.MockedFunction<
  typeof getItemInformation
>;
const mockedCraft = actionCraft as jest.MockedFunction<typeof actionCraft>;
const mockedOpen = getOpenWishlistRequests as jest.MockedFunction<
  typeof getOpenWishlistRequests
>;

const portalDemon = {
  code: 'portal_demon',
  name: 'Portal',
  content: { type: 'monster', code: 'demon' },
  duration: 60,
} as EventSchema;

const demon = {
  code: 'demon',
  name: 'Demon',
  level: 30,
  type: 'normal',
  drops: [{ code: 'demon_horn', rate: 10, min_quantity: 1, max_quantity: 1 }],
} as MonsterSchema;

const goldShield = {
  code: 'gold_shield',
  name: 'Gold shield',
  level: 30,
  type: 'shield',
  subtype: '',
  craft: {
    skill: 'gearcrafting',
    level: 30,
    items: [
      { code: 'gold_bar', quantity: 7 },
      { code: 'demon_horn', quantity: 4 },
    ],
    quantity: 1,
  },
} as ItemSchema;

const material = (code: string, subtype: string): ItemSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'resource',
    subtype,
    craft: null,
  }) as unknown as ItemSchema;

const workshop = { map_id: 1, x: 2, y: 1 } as MapSchema;

/** A crafter holding nothing, so every ingredient has to be acquired. */
const emptyHandedCrafter = () =>
  ({
    data: { ...mockCharacterData, name: 'LongLegLarry' },
    role: 'crafter',
    jobList: [],
    monsterData: [demon],
    itemsToKeep: [],
    checkQuantityOfItemInInv: jest.fn(() => 0),
    checkQuantityOfItemInBank: jest.fn(async () => 0),
    removeItemFromItemsToKeep: jest.fn(),
    removeItemListfromItemsToKeep: jest.fn(),
    addItemToItemsToKeep: jest.fn(),
    evaluateDepositItemsInBank: jest.fn(async () => undefined),
    evaluateGear: jest.fn(async () => undefined),
    gatherNow: jest.fn(async () => ObjectiveCompleted),
    craftNow: jest.fn(async () => ObjectiveCompleted),
    withdrawNow: jest.fn(async () => ObjectiveCompleted),
    depositNow: jest.fn(async () => ObjectiveCompleted),
    executeJobNow: jest.fn(async () => ObjectiveCompleted),
    move: jest.fn(async () => true),
    saveJobQueue: jest.fn(async () => undefined),
    findMaps: jest.fn(() => [workshop]),
    evaluateClosestMap: jest.fn(() => workshop),
    getCharacterLevel: jest.fn(() => 40),
  }) as unknown as Character;

beforeEach(() => {
  jest.clearAllMocks();
  clearEventContentCache();
  mockReadFile.mockResolvedValue(JSON.stringify([portalDemon]) as never);
  mockedCraft.mockResolvedValue({
    data: { character: { ...mockCharacterData } },
  } as never);
  mockedGetItem.mockImplementation(async (code: string) => {
    switch (code) {
      case 'gold_shield':
        return goldShield;
      case 'demon_horn':
        return material('demon_horn', 'mob');
      default:
        return material(code, 'bar');
    }
  });
});

describe('CraftObjective', () => {
  it('refuses a craft needing an event-only drop the bank cannot cover', async () => {
    const character = emptyHandedCrafter();
    const job = new CraftObjective(character, {
      code: 'gold_shield',
      quantity: 1,
    });

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(character.gatherNow).not.toHaveBeenCalled();
    expect(mockedCraft).not.toHaveBeenCalled();
  });

  it('goes ahead once the bank holds the whole amount', async () => {
    const character = emptyHandedCrafter();
    character.checkQuantityOfItemInBank = jest.fn(async (code: string) =>
      code === 'demon_horn' ? 4 : 0,
    ) as never;
    const job = new CraftObjective(character, {
      code: 'gold_shield',
      quantity: 1,
    });

    await job.run();

    expect(character.gatherNow).toHaveBeenCalledWith(7, 'gold_bar', true, true);
  });
});

describe('GatherObjective', () => {
  it('fails immediately rather than hunting an event monster', async () => {
    const character = emptyHandedCrafter();
    const job = new GatherObjective(character, {
      code: 'demon_horn',
      quantity: 4,
    });

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(character.evaluateDepositItemsInBank).not.toHaveBeenCalled();
  });
});

describe('IdentifyValidWishlistRequestsObjective', () => {
  beforeEach(() => {
    mockedOpen.mockResolvedValue([
      { id: 2816, item_code: 'gold_shield', quantity: 1 } as never,
    ]);
  });

  it('leaves a request open when it needs an event-only drop', async () => {
    const character = emptyHandedCrafter();
    const job = new IdentifyValidWishlistRequestsObjective(
      character,
      'gearcrafting',
    );

    await job.run();

    expect(character.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips a request above the character level without pricing the recipe', async () => {
    const character = emptyHandedCrafter();
    character.getCharacterLevel = jest.fn(() => 20) as never;
    const job = new IdentifyValidWishlistRequestsObjective(
      character,
      'gearcrafting',
    );

    await job.run();

    expect(character.executeJobNow).not.toHaveBeenCalled();
    // Walking the recipe tree is what costs a bank lookup per ingredient
    expect(character.checkQuantityOfItemInBank).not.toHaveBeenCalled();
  });

  it('picks the request up once the drop is banked', async () => {
    const character = emptyHandedCrafter();
    character.checkQuantityOfItemInBank = jest.fn(async (code: string) =>
      code === 'demon_horn' ? 4 : 0,
    ) as never;
    const job = new IdentifyValidWishlistRequestsObjective(
      character,
      'gearcrafting',
    );

    await job.run();

    expect(character.executeJobNow).toHaveBeenCalled();
  });
});
