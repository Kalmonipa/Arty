import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(async (code: string) => ITEMS[code]),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { CraftObjective } from '../../src/core/CraftObjective.js';
import { ItemSchema, SimpleItemSchema } from '../../src/types/types.js';

const ITEMS: Record<string, Partial<ItemSchema>> = {
  gold_bar: { code: 'gold_bar', craft: { skill: 'mining', level: 30 } as any },
  // Crafted by this character's own role, so it is never role-gated
  gold_ring: {
    code: 'gold_ring',
    craft: { skill: 'jewelrycrafting', level: 30 } as any,
  },
};

const makeCharacter = (inInventory: number, inBank: number) =>
  ({
    data: { name: 'LongLegLarry', inventory_max_items: 100 },
    role: 'crafter',
    jobList: [],
    wishlistRequestOwnerId: 'train_34_jewelrycrafting_84ae',
    checkQuantityOfItemInInv: jest.fn(() => inInventory),
    checkQuantityOfItemInBank: jest.fn(async () => inBank),
    handleErrors: jest.fn(async () => true),
  }) as any;

const requestGated = async (
  character: any,
  ingredients: SimpleItemSchema[],
  craftsNeeded: number,
) => {
  const job = new CraftObjective(
    character,
    { code: 'gold_ring', quantity: 5 },
    true,
    true,
    true,
  );
  const requested = jest
    .spyOn(job, 'requestIngredientFromWishlist')
    .mockResolvedValue(undefined);

  await (job as any).requestRoleGatedIngredients(ingredients, craftsNeeded);
  return requested;
};

describe('CraftObjective.requestRoleGatedIngredients', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for the whole amount the craft consumes, not the shortfall', async () => {
    // Larry parks ten jobs on gold_bar within 90 seconds, so every one of them
    // measures its shortfall against the same 30 bars and asks for 10. Ten rows
    // of 10 buy 100 bars against a collective need of 400, which is why those
    // jobs re-parked for four days instead of converging. The full amount is the
    // only figure that adds up across jobs sharing a material.
    const character = makeCharacter(0, 30);

    const requested = await requestGated(
      character,
      [{ code: 'gold_bar', quantity: 5 }],
      8,
    );

    expect(requested).toHaveBeenCalledWith(
      { code: 'gold_bar', quantity: 40 },
      { acquisitionMethod: 'mining' },
    );
  });

  it('asks for nothing when the bank and inventory already cover the craft', async () => {
    const character = makeCharacter(10, 30);

    const requested = await requestGated(
      character,
      [{ code: 'gold_bar', quantity: 5 }],
      8,
    );

    expect(requested).not.toHaveBeenCalled();
  });

  it('ignores ingredients this character crafts itself', async () => {
    const character = makeCharacter(0, 0);

    const requested = await requestGated(
      character,
      [{ code: 'gold_ring', quantity: 1 }],
      3,
    );

    expect(requested).not.toHaveBeenCalled();
  });
});
