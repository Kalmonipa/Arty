import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionDepositGold: jest.fn(),
  actionWithdrawGold: jest.fn(),
  purchaseBankExpansion: jest.fn(),
}));

import { getBankDetails } from '../../src/api_calls/Bank.js';
import { Character } from '../../src/character/character.js';
import { ApiError } from '../../src/core/Error.js';
import {
  cacheBankGold,
  clearBankGoldCache,
} from '../../src/core/bankQuantityCache.js';
import { BankQuantityCacheTtlMs } from '../../src/constants.js';
import { ConditionOperator } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const bankWith = (gold: number) => ({
  data: { slots: 200, expansions: 1, next_expansion_cost: 10000, gold },
});

const goldCost = (value: number) => [
  { code: 'gold', operator: ConditionOperator.cost, value },
];

describe('bank gold cache', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearBankGoldCache();
    character = new Character({ ...mockCharacterData, gold: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves repeat gold-cost checks from one API read', async () => {
    jest.mocked(getBankDetails).mockResolvedValue(bankWith(5000));

    expect(await character.canSatisfyConditions(goldCost(1000))).toBe(true);
    expect(await character.canSatisfyConditions(goldCost(2000))).toBe(true);
    expect(await character.canSatisfyConditions(goldCost(9000))).toBe(false);

    expect(getBankDetails).toHaveBeenCalledTimes(1);
  });

  it('reads again once the entry has aged past the TTL', async () => {
    jest
      .mocked(getBankDetails)
      .mockResolvedValueOnce(bankWith(100))
      .mockResolvedValueOnce(bankWith(9000));

    expect(await character.canSatisfyConditions(goldCost(500))).toBe(false);

    jest.advanceTimersByTime(BankQuantityCacheTtlMs);

    expect(await character.canSatisfyConditions(goldCost(500))).toBe(true);
    expect(getBankDetails).toHaveBeenCalledTimes(2);
  });

  it('caches a zero balance rather than re-reading it', async () => {
    jest.mocked(getBankDetails).mockResolvedValue(bankWith(0));

    expect(await character.canSatisfyConditions(goldCost(1))).toBe(false);
    expect(await character.canSatisfyConditions(goldCost(1))).toBe(false);

    expect(getBankDetails).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    jest
      .mocked(getBankDetails)
      .mockResolvedValueOnce(
        new ApiError({ code: 429, message: 'Rate limited' }),
      )
      .mockResolvedValueOnce(bankWith(5000));

    expect(await character.canSatisfyConditions(goldCost(1000))).toBe(false);
    expect(await character.canSatisfyConditions(goldCost(1000))).toBe(true);

    expect(getBankDetails).toHaveBeenCalledTimes(2);
  });

  it('skips the read entirely when the character already holds enough', async () => {
    jest.mocked(getBankDetails).mockResolvedValue(bankWith(5000));
    character = new Character({ ...mockCharacterData, gold: 3000 });

    expect(await character.canSatisfyConditions(goldCost(1000))).toBe(true);

    expect(getBankDetails).not.toHaveBeenCalled();
  });

  it('serves the balance a gold transaction reported without a fresh read', async () => {
    jest.mocked(getBankDetails).mockResolvedValue(bankWith(5000));

    cacheBankGold(250);

    expect(await character.canSatisfyConditions(goldCost(200))).toBe(true);
    expect(await character.canSatisfyConditions(goldCost(300))).toBe(false);
    expect(getBankDetails).not.toHaveBeenCalled();
  });
});
