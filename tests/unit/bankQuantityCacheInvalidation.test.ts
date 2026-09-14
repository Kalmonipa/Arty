import { jest } from '@jest/globals';
import {
  actionDepositItems,
  actionWithdrawItem,
} from '../../src/api_calls/Actions.js';
import {
  actionDepositGold,
  actionWithdrawGold,
  purchaseBankExpansion,
} from '../../src/api_calls/Bank.js';
import {
  cacheBankGold,
  cacheBankQuantity,
  clearBankGoldCache,
  clearBankQuantityCache,
  readCachedBankGold,
  readCachedBankQuantity,
} from '../../src/core/bankQuantityCache.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: {} }),
  } as unknown as Response;
}

function goldResponse(bank: { quantity: number }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { bank } }),
  } as unknown as Response;
}

function expansionResponse(transaction: { price: number }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { transaction } }),
  } as unknown as Response;
}

/**
 * The memo is only safe because moving an item in or out of the bank drops that
 * code. If the wiring in Actions.ts is lost, reads stay stale for the whole TTL
 * and characters act on quantities that are no longer there.
 */
describe('banking an item invalidates its cached quantity', () => {
  beforeEach(() => {
    clearBankQuantityCache();
    jest.spyOn(global, 'fetch').mockResolvedValue(okResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drops the deposited codes', async () => {
    cacheBankQuantity('algae', 3);
    cacheBankQuantity('sap', 90);

    await actionDepositItems(mockCharacterData, [
      { code: 'algae', quantity: 20 },
    ]);

    expect(readCachedBankQuantity('algae')).toBeUndefined();
    expect(readCachedBankQuantity('sap')).toBe(90);
  });

  it('drops the withdrawn codes', async () => {
    cacheBankQuantity('minor_health_potion', 500);
    cacheBankQuantity('sap', 90);

    await actionWithdrawItem(mockCharacterData, [
      { code: 'minor_health_potion', quantity: 100 },
    ]);

    expect(readCachedBankQuantity('minor_health_potion')).toBeUndefined();
    expect(readCachedBankQuantity('sap')).toBe(90);
  });

  it('drops every code in a multi-item deposit', async () => {
    cacheBankQuantity('algae', 3);
    cacheBankQuantity('trout', 40);

    await actionDepositItems(mockCharacterData, [
      { code: 'algae', quantity: 20 },
      { code: 'trout', quantity: 150 },
    ]);

    expect(readCachedBankQuantity('algae')).toBeUndefined();
    expect(readCachedBankQuantity('trout')).toBeUndefined();
  });

  it('leaves the cache alone when the deposit fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 478,
      json: async () => ({ error: { code: 478 } }),
    } as unknown as Response);
    cacheBankQuantity('algae', 3);

    await actionDepositItems(mockCharacterData, [
      { code: 'algae', quantity: 20 },
    ]);

    expect(readCachedBankQuantity('algae')).toBe(3);
  });
});

/**
 * Same contract for gold: the balance is only safe to memo because every path
 * that moves it says so. Both transactions report the resulting balance, so they
 * refresh the memo; buying an expansion spends gold without reporting a balance,
 * so it can only drop it. Lose this wiring and the pathfinder spends the whole
 * TTL deciding gates are passable on gold that has already been spent.
 */
describe('moving gold updates the cached bank balance', () => {
  beforeEach(() => {
    clearBankGoldCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('takes the balance a deposit reports', async () => {
    cacheBankGold(100);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(goldResponse({ quantity: 350 }));

    await actionDepositGold(mockCharacterData, 250);

    expect(readCachedBankGold()).toBe(350);
  });

  it('takes the balance a withdrawal reports', async () => {
    cacheBankGold(1000);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(goldResponse({ quantity: 400 }));

    await actionWithdrawGold(mockCharacterData, 600);

    expect(readCachedBankGold()).toBe(400);
  });

  it('drops the balance when an expansion is bought', async () => {
    cacheBankGold(50000);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(expansionResponse({ price: 10000 }));

    await purchaseBankExpansion(mockCharacterData);

    expect(readCachedBankGold()).toBeUndefined();
  });

  it('leaves the balance alone when the transaction fails', async () => {
    cacheBankGold(1000);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 492,
      json: async () => ({ error: { code: 492, message: 'Not enough gold' } }),
    } as unknown as Response);

    await actionWithdrawGold(mockCharacterData, 5000);

    expect(readCachedBankGold()).toBe(1000);
  });
});
