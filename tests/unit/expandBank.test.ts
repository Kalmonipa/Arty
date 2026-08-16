import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Bank', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionWithdrawGold: jest.fn(),
  purchaseBankExpansion: jest.fn(),
}));

import {
  getBankItems,
  getBankDetails,
  purchaseBankExpansion,
} from '../../src/api_calls/Bank.js';
import { ExpandBankObjective } from '../../src/core/BankExpansion.js';
import {
  clearBankSlotCache,
  readCachedBankSlotsUsed,
} from '../../src/core/bankQuantityCache.js';
import { ApiError } from '../../src/core/Error.js';

const mockedItems = getBankItems as jest.MockedFunction<typeof getBankItems>;
const mockedDetails = getBankDetails as jest.MockedFunction<
  typeof getBankDetails
>;
const mockedPurchase = purchaseBankExpansion as jest.MockedFunction<
  typeof purchaseBankExpansion
>;

const character = {
  data: { name: 'LongLegLarry' },
  jobList: [],
  handleErrors: jest.fn(async () => true),
  getAvailableBanks: jest.fn(async () => []),
} as never;

/** `total` is the number of occupied slots; `slots` is the bank's capacity */
const bankHolding = (used: number, slots: number, gold = 0, cost = 1000) => {
  mockedItems.mockResolvedValue({
    data: [],
    total: used,
    page: 1,
    pages: 1,
    size: 1,
  } as never);
  mockedDetails.mockResolvedValue({
    data: { slots, expansions: 1, next_expansion_cost: cost, gold },
  } as never);
};

describe('ExpandBankObjective fullness check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearBankSlotCache();
  });

  it('does nothing when the bank has plenty of room', async () => {
    bankHolding(20, 200);

    const result = await new ExpandBankObjective(character).run();

    expect(result.success).toBe(true);
    expect(mockedPurchase).not.toHaveBeenCalled();
  });

  it('does nothing at exactly the threshold', async () => {
    // 89% full — under the 90% trigger
    bankHolding(178, 200);

    await new ExpandBankObjective(character).run();

    expect(mockedPurchase).not.toHaveBeenCalled();
  });

  it('looks to expand once the bank is nearly full', async () => {
    // 95% full, and nowhere near enough gold, so it stops at the money check
    bankHolding(190, 200, 100, 50000);

    const result = await new ExpandBankObjective(character).run();

    expect(result.success).toBe(false);
    expect(mockedPurchase).not.toHaveBeenCalled();
  });

  it('survives a bank that reports no capacity', async () => {
    bankHolding(0, 0);

    const result = await new ExpandBankObjective(character).run();

    expect(result.success).toBe(true);
    expect(mockedPurchase).not.toHaveBeenCalled();
  });
});

describe('ExpandBankObjective bank reads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearBankSlotCache();
  });

  it('asks for a single item, since only the total is wanted', async () => {
    bankHolding(20, 200);

    await new ExpandBankObjective(character).run();

    expect(mockedItems).toHaveBeenCalledWith(undefined, 1, 1);
  });

  it('reuses the slot count instead of listing the bank again', async () => {
    // The behaviour that matters: a full bank ran this once per failed deposit
    bankHolding(190, 200, 100, 50000);

    await new ExpandBankObjective(character).run();
    await new ExpandBankObjective(character).run();
    await new ExpandBankObjective(character).run();

    expect(mockedItems).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    mockedItems.mockResolvedValue(
      new ApiError({ code: 429, message: 'rate limited' }) as never,
    );

    const result = await new ExpandBankObjective(character).run();

    expect(result.success).toBe(false);
    expect(readCachedBankSlotsUsed()).toBeUndefined();
  });
});
