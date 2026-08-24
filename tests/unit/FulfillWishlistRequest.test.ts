import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  claimWishlistRequest: jest.fn(async () => true),
  markAsFulfilled: jest.fn(async () => true),
  markAsNotExecuting: jest.fn(async () => true),
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { FulfillWishlistRequestObjective } from '../../src/wishlist/fulfillWishlistRequest.objective.js';
import {
  claimWishlistRequest,
  markAsFulfilled,
  markAsNotExecuting,
} from '../../src/wishlist/wishlist.utils.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';

const mockedClaim = claimWishlistRequest as jest.MockedFunction<
  typeof claimWishlistRequest
>;
const mockedFulfilled = markAsFulfilled as jest.MockedFunction<
  typeof markAsFulfilled
>;
const mockedNotExecuting = markAsNotExecuting as jest.MockedFunction<
  typeof markAsNotExecuting
>;

const makeRequest = (overrides?: Partial<WishlistRow>): WishlistRow =>
  ({
    id: 376,
    item_code: 'gold_shield',
    quantity: 1,
    character: 'ChoppyChad',
    acquisition_method: 'gearcrafting',
    executing: false,
    fulfilled: false,
    ...overrides,
  }) as WishlistRow;

const makeCharacter = (banked: number, inventoryMaxItems = 100) => ({
  data: { name: 'LongLegLarry', inventory_max_items: inventoryMaxItems },
  jobList: [],
  checkQuantityOfItemInBank: jest.fn(async () => banked),
  gatherNow: jest.fn(async () => ({
    complete: true,
    success: true,
    reason: 'complete',
  })),
  depositNow: jest.fn(async () => ({
    complete: true,
    success: true,
    reason: 'complete',
  })),
});

describe('FulfillWishlistRequestObjective', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
  });

  it('makes nothing when the bank already holds the requested item', async () => {
    const character = makeCharacter(1);
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest(),
    );

    const result = await job.run();

    expect(result.success).toBe(true);
    expect(character.gatherNow).not.toHaveBeenCalled();
    expect(character.depositNow).not.toHaveBeenCalled();
    expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('makes up only the shortfall when the bank holds some of the request', async () => {
    const character = makeCharacter(10);
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest({ item_code: 'steel_bar', quantity: 25 }),
    );

    await job.run();

    expect(character.gatherNow).toHaveBeenCalledTimes(1);
    expect(character.gatherNow).toHaveBeenCalledWith(15, 'steel_bar');
    expect(character.depositNow).toHaveBeenCalledWith(15, 'steel_bar');
    expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('makes the whole request when the bank holds none of it', async () => {
    const character = makeCharacter(0);
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest({ item_code: 'steel_bar', quantity: 25 }),
    );

    await job.run();

    expect(character.gatherNow).toHaveBeenCalledWith(25, 'steel_bar');
  });

  it('splits a request larger than the inventory into carryable batches', async () => {
    const character = makeCharacter(0, 100);
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest({ item_code: 'iron_ore', quantity: 150 }),
    );

    await job.run();

    expect(character.gatherNow.mock.calls).toEqual([
      [90, 'iron_ore'],
      [60, 'iron_ore'],
    ]);
    expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('stops and releases the claim when a batch cannot be delivered', async () => {
    const character = makeCharacter(0, 100);
    character.depositNow = jest.fn(async () => ({
      complete: true,
      success: false,
      reason: 'failed',
    })) as any;
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest({ item_code: 'iron_ore', quantity: 150 }),
    );

    await job.run();

    expect(character.gatherNow).toHaveBeenCalledTimes(1);
    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  describe('materials requests ignore the bank', () => {
    // A mining/woodcutting row records how many MORE the requester needs — it
    // already netted off the bank when it raised the row. Measuring against the
    // bank again subtracted the same balance twice and closed the row untouched,
    // which parked LongLegLarry's crafting jobs 33 times over on the same gold_bar.
    it.each([
      ['mining', 'gold_bar'],
      ['woodcutting', 'cursed_plank'],
    ])(
      'makes the full %s request even when the bank looks covered',
      async (method, item) => {
        const character = makeCharacter(30);
        const job = new FulfillWishlistRequestObjective(
          character as any,
          makeRequest({
            item_code: item,
            quantity: 10,
            acquisition_method: method as WishlistRow['acquisition_method'],
          }),
        );

        await job.run();

        expect(character.checkQuantityOfItemInBank).not.toHaveBeenCalled();
        expect(character.gatherNow).toHaveBeenCalledWith(10, item);
        expect(character.depositNow).toHaveBeenCalledWith(10, item);
        expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
      },
    );

    it('still batches a materials request larger than the inventory', async () => {
      const character = makeCharacter(0, 100);
      const job = new FulfillWishlistRequestObjective(
        character as any,
        makeRequest({
          item_code: 'iron_ore',
          quantity: 150,
          acquisition_method: 'mining',
        }),
      );

      await job.run();

      expect(character.gatherNow.mock.calls).toEqual([
        [90, 'iron_ore'],
        [60, 'iron_ore'],
      ]);
    });

    it('leaves equipment requests checking the bank first', async () => {
      const character = makeCharacter(1);
      const job = new FulfillWishlistRequestObjective(
        character as any,
        makeRequest({ acquisition_method: 'gearcrafting' }),
      );

      await job.run();

      expect(character.checkQuantityOfItemInBank).toHaveBeenCalled();
      expect(character.gatherNow).not.toHaveBeenCalled();
      expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
    });
  });

  it('does not read the bank when the claim was lost to another character', async () => {
    mockedClaim.mockResolvedValue(false);
    const character = makeCharacter(0);
    const job = new FulfillWishlistRequestObjective(
      character as any,
      makeRequest(),
    );

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(character.checkQuantityOfItemInBank).not.toHaveBeenCalled();
    expect(character.gatherNow).not.toHaveBeenCalled();
  });
});
