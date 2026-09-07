import { jest } from '@jest/globals';

const getAllItemInformation = jest.fn<() => Promise<{ data: unknown[] }>>();
const getItemInformation =
  jest.fn<() => Promise<{ code: string; subtype: string }>>();

jest.mock('../../src/api_calls/Items.js', () => ({
  getAllItemInformation,
  getItemInformation,
  actionClaimPendingItems: jest.fn(),
  getPendingItems: jest.fn(),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
}));

import { Character } from '../../src/character/character.js';
import { IdleCrafterObjective } from '../../src/idleObjectives/idleCrafter.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  ObjectiveCompleted,
  OnHoldJob,
} from '../../src/types/ObjectiveData.js';

/** A weaponcrafting tool whose only ingredient is an ordinary resource, so
 * needsBossDrop resolves false without reaching the monster API */
const tool = (code: string) => ({
  code,
  name: code,
  level: 40,
  type: 'weapon',
  subtype: 'tool',
  craft: {
    skill: 'weaponcrafting',
    items: [{ code: 'mithril_bar', quantity: 8 }],
  },
});

const parkedCraft = (code: string): OnHoldJob =>
  ({
    job: {
      type: 'CraftObjective',
      objectiveId: `craft_1_${code}_4a75`,
      status: 'on_hold',
      progress: 0,
      maxRetries: 3,
      target: { code, quantity: 1 },
      blockOnMissing: true,
    },
    parkedAt: '2026-09-02T12:23:01.000Z',
    retried: false,
  }) as unknown as OnHoldJob;

describe('craftMissingTools skips tools already parked', () => {
  let character: Character;
  let craftMissingTools: () => Promise<unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({
      ...mockCharacterData,
      weaponcrafting_level: 40,
    });
    // Bank is empty, so every tool looks missing
    character.getAllBankItems = jest.fn(async () => []);
    character.craftNow = jest.fn(async () => ObjectiveCompleted);
    character.depositNow = jest.fn(async () => ObjectiveCompleted);
    getItemInformation.mockResolvedValue({
      code: 'mithril_bar',
      subtype: 'resource',
    });

    const objective = new IdleCrafterObjective(character, 'crafter');
    craftMissingTools = (
      objective as unknown as { craftMissingTools: () => Promise<unknown> }
    ).craftMissingTools.bind(objective);
  });

  it('does not start a craft for a tool with a craft already parked', async () => {
    getAllItemInformation.mockResolvedValue({
      data: [tool('mithril_pickaxe')],
    });
    character.onHold = [parkedCraft('mithril_pickaxe')];

    await craftMissingTools();

    expect(character.craftNow).not.toHaveBeenCalled();
  });

  it('starts a craft for a tool nothing is parked for', async () => {
    getAllItemInformation.mockResolvedValue({ data: [tool('mithril_axe')] });
    character.onHold = [parkedCraft('mithril_pickaxe')];

    await craftMissingTools();

    expect(character.craftNow).toHaveBeenCalledWith(
      1,
      'mithril_axe',
      undefined,
      undefined,
      true,
    );
  });
});
