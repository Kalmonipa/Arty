import { jest } from '@jest/globals';
import {
  actionDepositItems,
  actionWithdrawItem,
} from '../../src/api_calls/Actions.js';
import {
  cacheBankQuantity,
  clearBankQuantityCache,
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
