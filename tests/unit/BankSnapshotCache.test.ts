import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionDepositGold: jest.fn(),
}));

import { getBankItems } from '../../src/api_calls/Bank.js';
import { Character } from '../../src/character/character.js';
import { BankCache } from '../../src/core/BankCache.js';
import { ApiError } from '../../src/core/Error.js';
import {
  clearBankQuantityCache,
  clearBankSnapshot,
  invalidateBankQuantities,
} from '../../src/core/bankQuantityCache.js';
import { BankQuantityCacheTtlMs } from '../../src/constants.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

/**
 * A bank big enough to need paging, which is what the live bank looks like. Each
 * full listing therefore costs two `/my/bank/items` calls, and a gear evaluation
 * paid that on every entry before the snapshot was memoised.
 */
const pageOne = () => ({
  data: [{ code: 'copper_ore', quantity: 12 }],
  total: 2,
  page: 1,
  size: 100,
  pages: 2,
});

const pageTwo = () => ({
  data: [{ code: 'greater_health_potion', quantity: 4 }],
  total: 2,
  page: 2,
  size: 100,
  pages: 2,
});

/**
 * Fresh objects per call, because getAllBankItems pushes later pages into the
 * first response's own array. A shared fixture would accumulate across calls
 * and hide what the snapshot actually returned.
 */
function bankRespondsWithTwoPages() {
  jest
    .mocked(getBankItems)
    .mockImplementation(async (_code?: string, page?: number) =>
      page === 2 ? pageTwo() : pageOne(),
    );
}

describe('full bank snapshot cache', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearBankQuantityCache();
    clearBankSnapshot();
    character = new Character({ ...mockCharacterData });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves a repeat gear evaluation without listing the bank again', async () => {
    bankRespondsWithTwoPages();

    const first = await BankCache.create(character);
    const second = await BankCache.create(character);

    expect(first.quantityOf('greater_health_potion')).toBe(4);
    expect(second.quantityOf('greater_health_potion')).toBe(4);
    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  it('lists the bank again once the snapshot has aged past the TTL', async () => {
    bankRespondsWithTwoPages();

    await BankCache.create(character);
    jest.advanceTimersByTime(BankQuantityCacheTtlMs);
    await BankCache.create(character);

    expect(getBankItems).toHaveBeenCalledTimes(4);
  });

  it('drops the snapshot when an item moves in or out of the bank', async () => {
    bankRespondsWithTwoPages();

    await BankCache.create(character);
    invalidateBankQuantities(['greater_health_potion']);
    await BankCache.create(character);

    expect(getBankItems).toHaveBeenCalledTimes(4);
  });

  it('does not memoise a failed listing', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(
        new ApiError({ code: 429, message: 'Rate limited' }),
      )
      .mockImplementation(async (_code?: string, page?: number) =>
        page === 2 ? pageTwo() : pageOne(),
      );

    const failed = await BankCache.create(character);
    const retried = await BankCache.create(character);

    expect(failed.stale).toBe(true);
    expect(retried.stale).toBe(false);
    expect(retried.quantityOf('copper_ore')).toBe(12);
  });

  it('hands each caller its own snapshot so a spend does not leak', async () => {
    bankRespondsWithTwoPages();
    await BankCache.create(character); // prime, so both reads below are cache hits

    const first = await BankCache.create(character);
    first.remove('greater_health_potion', 4);
    const second = await BankCache.create(character);

    expect(first.quantityOf('greater_health_potion')).toBe(0);
    expect(second.quantityOf('greater_health_potion')).toBe(4);
  });
});
