import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/missingIngredients.js', () => ({
  missingIngredientsFor: jest.fn(async () => []),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  claimWishlistRequest: jest.fn(async () => true),
  markAsFulfilled: jest.fn(async () => true),
  markAsNotExecuting: jest.fn(async () => true),
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
  bankedStockSpokenFor: jest.fn(async () => 0),
}));

import { FulfillWishlistRequestObjective } from '../../src/wishlist/fulfillWishlistRequest.objective.js';
import {
  bankedStockSpokenFor,
  claimWishlistRequest,
  markAsFulfilled,
  markAsNotExecuting,
} from '../../src/wishlist/wishlist.utils.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';
import { Character } from '../../src/character/character.js';
import { missingIngredientsFor } from '../../src/wishlist/missingIngredients.js';

const mockedMissing = missingIngredientsFor as jest.MockedFunction<
  typeof missingIngredientsFor
>;

const mockedClaim = claimWishlistRequest as jest.MockedFunction<
  typeof claimWishlistRequest
>;
const mockedFulfilled = markAsFulfilled as jest.MockedFunction<
  typeof markAsFulfilled
>;
const mockedNotExecuting = markAsNotExecuting as jest.MockedFunction<
  typeof markAsNotExecuting
>;
const mockedSpokenFor = bankedStockSpokenFor as jest.MockedFunction<
  typeof bankedStockSpokenFor
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
    mockedSpokenFor.mockResolvedValue(0);
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

describe('a failed fulfilment reports failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
    mockedSpokenFor.mockResolvedValue(0);
  });

  // The objective used to return ObjectiveCompleted whichever way it went, so a
  // request that could not be made was recorded as a success. The metric read 729
  // fulfilments in a day while the backlog grew and nothing was ever produced.
  it('reports failure when a batch cannot be delivered', async () => {
    const character = makeCharacter(0, 100);
    character.depositNow = jest.fn(async () => ({
      complete: true,
      success: false,
      reason: 'failed',
    })) as unknown as typeof character.depositNow;
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'earth_shield' }),
    );

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(mockedNotExecuting).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('still reports success when the request is delivered', async () => {
    const character = makeCharacter(0);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'steel_bar', quantity: 5 }),
    );

    expect((await job.run()).success).toBe(true);
  });

  it('reports success when the bank already covers the request', async () => {
    const character = makeCharacter(1);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest(),
    );

    expect((await job.run()).success).toBe(true);
  });
});

describe('banked stock is shared between requesters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
    mockedSpokenFor.mockResolvedValue(0);
  });

  it('does not claim banked stock an earlier request is waiting on', async () => {
    // One air_shield banked, an older row already relying on it
    mockedSpokenFor.mockResolvedValue(1);
    const character = makeCharacter(1);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'air_shield' }),
    );

    await job.run();

    expect(character.gatherNow).toHaveBeenCalledWith(1, 'air_shield');
    expect(character.depositNow).toHaveBeenCalledWith(1, 'air_shield');
  });

  it('claims only the banked stock beyond what earlier rows need', async () => {
    // Three banked, two spoken for, so one is free for this row
    mockedSpokenFor.mockResolvedValue(2);
    const character = makeCharacter(3);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'air_shield' }),
    );

    const result = await job.run();

    expect(result.success).toBe(true);
    expect(character.gatherNow).not.toHaveBeenCalled();
    expect(mockedFulfilled).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('makes up only the shortfall left after earlier demand', async () => {
    mockedSpokenFor.mockResolvedValue(4);
    const character = makeCharacter(10);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'steel_bar', quantity: 25 }),
    );

    await job.run();

    // 10 banked less the 4 spoken for leaves 6 toward the 25 requested
    expect(character.gatherNow).toHaveBeenCalledWith(19, 'steel_bar');
  });

  it('leaves materials requests ignoring the bank entirely', async () => {
    mockedSpokenFor.mockResolvedValue(5);
    const character = makeCharacter(30);
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({
        item_code: 'gold_bar',
        quantity: 10,
        acquisition_method: 'mining',
      }),
    );

    await job.run();

    expect(mockedSpokenFor).not.toHaveBeenCalled();
    expect(character.gatherNow).toHaveBeenCalledWith(10, 'gold_bar');
  });
});

describe('a failed fulfilment says what it was short of', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
    mockedSpokenFor.mockResolvedValue(0);
    mockedMissing.mockResolvedValue([]);
  });

  const failingCharacter = () => {
    const character = makeCharacter(0, 100);
    character.depositNow = jest.fn(async () => ({
      complete: true,
      success: false,
      reason: 'failed',
    })) as unknown as typeof character.depositNow;
    return character;
  };

  it('names the ingredient it could not obtain', async () => {
    mockedMissing.mockResolvedValue([
      {
        code: 'rosenblood_elixir',
        quantity: 1,
        reason: 'only drops from the boss rosenblood',
      },
    ]);
    const character = failingCharacter();
    const job = new FulfillWishlistRequestObjective(
      character as unknown as Character,
      makeRequest({ item_code: 'earth_shield' }),
    );
    const warn = jest.spyOn(
      (job as unknown as { log: { warn: (message: string) => void } }).log,
      'warn',
    );

    await job.run();

    expect(mockedMissing).toHaveBeenCalledWith(character, 'earth_shield', 1);
    const logged = warn.mock.calls.map(([m]) => String(m)).join(' | ');
    expect(logged).toContain('rosenblood_elixir');
    expect(logged).toContain('only drops from the boss rosenblood');
  });

  it('still reports the failure when it cannot work out what was missing', async () => {
    mockedMissing.mockResolvedValue([]);
    const job = new FulfillWishlistRequestObjective(
      failingCharacter() as unknown as Character,
      makeRequest({ item_code: 'earth_shield' }),
    );

    expect((await job.run()).success).toBe(false);
  });

  it('still releases the claim when working out the cause blows up', async () => {
    // reportShortfall runs on the failure path; a throw there used to escape the
    // finally block and leave the row executing forever, which is the state the
    // double-claim fix exists to avoid
    mockedMissing.mockRejectedValue(new Error('catalogue unreachable'));
    const job = new FulfillWishlistRequestObjective(
      failingCharacter() as unknown as Character,
      makeRequest({ item_code: 'earth_shield' }),
    );

    const result = await job.run();

    expect(result.success).toBe(false);
    expect(mockedNotExecuting).toHaveBeenCalledWith(376, 'LongLegLarry');
  });

  it('does not go looking for a cause when the request succeeded', async () => {
    const job = new FulfillWishlistRequestObjective(
      makeCharacter(0) as unknown as Character,
      makeRequest({ item_code: 'steel_bar', quantity: 2 }),
    );

    await job.run();

    expect(mockedMissing).not.toHaveBeenCalled();
  });
});
