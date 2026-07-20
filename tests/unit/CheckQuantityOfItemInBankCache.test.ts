import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(),
  getBankDetails: jest.fn(),
  actionDepositGold: jest.fn(),
}));

import { getBankItems } from '../../src/api_calls/Bank.js';
import { Character } from '../../src/character/characterClass.js';
import { BankCache } from '../../src/core/BankCache.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

describe('Character.checkQuantityOfItemInBank with a BankCache', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
  });

  it('reads from the cache without calling the bank API', async () => {
    const cache = await BankCache.create({
      getAllBankItems: async () => [{ code: 'skull_ring', quantity: 4 }],
    } as unknown as Character);

    const qty = await character.checkQuantityOfItemInBank('skull_ring', cache);

    expect(qty).toBe(4);
    expect(getBankItems).not.toHaveBeenCalled();
  });

  it('falls back to a live bank API call when no cache is provided', async () => {
    jest.mocked(getBankItems).mockResolvedValue({
      data: [{ code: 'skull_ring', quantity: 4 }],
      total: 1,
      page: 1,
      size: 1,
      pages: 1,
    });

    const qty = await character.checkQuantityOfItemInBank('skull_ring');

    expect(qty).toBe(4);
    expect(getBankItems).toHaveBeenCalledWith('skull_ring');
  });
});
