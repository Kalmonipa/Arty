import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionDepositGold: jest.fn(),
}));

import { getBankItems } from '../../src/api_calls/Bank.js';
import { Character } from '../../src/character/CharacterClass.js';
import { BankCache } from '../../src/core/BankCache.js';
import { ApiError } from '../../src/core/Error.js';
import {
  clearBankQuantityCache,
  invalidateBankQuantities,
} from '../../src/core/bankQuantityCache.js';
import { BankQuantityCacheTtlMs } from '../../src/constants.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const bankHolding = (code: string, quantity: number) => ({
  data: [{ code, quantity }],
  total: 1,
  page: 1,
  size: 1,
  pages: 1,
});

describe('per-item bank quantity cache', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    clearBankQuantityCache();
    character = new Character({ ...mockCharacterData });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves a repeat lookup of the same code without a second API call', async () => {
    jest.mocked(getBankItems).mockResolvedValue(bankHolding('nettle_leaf', 12));

    const first = await character.checkQuantityOfItemInBank('nettle_leaf');
    const second = await character.checkQuantityOfItemInBank('nettle_leaf');

    expect(first).toBe(12);
    expect(second).toBe(12);
    expect(getBankItems).toHaveBeenCalledTimes(1);
  });

  it('keeps each item code separate', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(bankHolding('algae', 3))
      .mockResolvedValueOnce(bankHolding('sap', 90));

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(3);
    expect(await character.checkQuantityOfItemInBank('sap')).toBe(90);
    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  it('reads again once the entry has aged past the TTL', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(bankHolding('algae', 3))
      .mockResolvedValueOnce(bankHolding('algae', 40));

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(3);

    jest.advanceTimersByTime(BankQuantityCacheTtlMs);

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(40);
    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  it('still serves from cache just before the TTL expires', async () => {
    jest.mocked(getBankItems).mockResolvedValue(bankHolding('algae', 3));

    await character.checkQuantityOfItemInBank('algae');
    jest.advanceTimersByTime(BankQuantityCacheTtlMs - 1);
    await character.checkQuantityOfItemInBank('algae');

    expect(getBankItems).toHaveBeenCalledTimes(1);
  });

  it('drops an entry when that item is banked, so the next read is live', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(bankHolding('algae', 3))
      .mockResolvedValueOnce(bankHolding('algae', 103));

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(3);

    invalidateBankQuantities(['algae']);

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(103);
    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  it('leaves other codes cached when one is invalidated', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(bankHolding('algae', 3))
      .mockResolvedValueOnce(bankHolding('sap', 90));

    await character.checkQuantityOfItemInBank('algae');
    await character.checkQuantityOfItemInBank('sap');

    invalidateBankQuantities(['algae']);
    await character.checkQuantityOfItemInBank('sap');

    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  // A failed read returns 0. Caching that would look identical to an empty bank
  // for the whole TTL, which is how a 429 turns into a wrong decision
  it('does not cache the zero returned by a failed lookup', async () => {
    jest
      .mocked(getBankItems)
      .mockResolvedValueOnce(
        new ApiError({ code: 429, message: 'Rate limited' }) as never,
      )
      .mockResolvedValueOnce(bankHolding('algae', 7));

    expect(await character.checkQuantityOfItemInBank('algae')).toBe(0);
    expect(await character.checkQuantityOfItemInBank('algae')).toBe(7);
    expect(getBankItems).toHaveBeenCalledTimes(2);
  });

  it('lets an explicit BankCache snapshot take precedence over the memo', async () => {
    jest.mocked(getBankItems).mockResolvedValue(bankHolding('algae', 3));
    await character.checkQuantityOfItemInBank('algae');

    const snapshot = await BankCache.create({
      getAllBankItems: async () => [{ code: 'algae', quantity: 999 }],
    } as unknown as Character);

    expect(await character.checkQuantityOfItemInBank('algae', snapshot)).toBe(
      999,
    );
  });
});
