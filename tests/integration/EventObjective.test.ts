import { jest } from '@jest/globals';
import { EventObjective } from '../../src/core/EventObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ApiError } from '../../src/core/Error.js';
import { ActiveEventSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/NPC', () => ({
  getNpc: jest.fn(),
}));

jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

import { getNpc } from '../../src/api_calls/NPC.js';
import { getItemInformation } from '../../src/api_calls/Items.js';

const mockGetNpc = getNpc as jest.MockedFunction<typeof getNpc>;
const mockGetItemInformation = getItemInformation as jest.MockedFunction<typeof getItemInformation>;

const makeMerchantEvent = (code: 'fish_merchant' | 'nomadic_merchant'): ActiveEventSchema =>
  ({
    code,
    name: code,
    expiration: new Date(Date.now() + 3_600_000).toISOString(),
    created_at: new Date().toISOString(),
    duration: 60,
    map: { map_id: 1, x: 0, y: 0, content: null, skin: '', layer: 'overworld' },
    previous_map: { map_id: 1, x: 0, y: 0, content: null, skin: '', layer: 'overworld' },
  } as unknown as ActiveEventSchema);

class SimpleMockCharacter {
  data = { ...mockCharacterData };
  allMaps = [{ map_id: mockCharacterData.map_id, x: 0, y: 0 }];
  fishMerchantTradeDate = 0;
  nomadicMerchantTradeDate = 0;

  bankItems: Record<string, number> = {};

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    return this.bankItems[code] ?? 0;
  });

  withdrawNow = jest.fn(async (_qty: number, _code: string): Promise<boolean> => true);
  tradeWithNpcNow = jest.fn(async (): Promise<void> => {});
  depositNow = jest.fn(async (): Promise<void> => {});
}

describe('EventObjective - sellToMerchant', () => {
  let character: SimpleMockCharacter;

  const makeObjective = (code: 'fish_merchant' | 'nomadic_merchant') =>
    new EventObjective(character as any, makeMerchantEvent(code));

  const makeNpcResponse = (items: { code: string; buy_price: number | null; sell_price: number | null }[]) => ({
    name: 'Test Merchant',
    code: 'test_merchant',
    description: '',
    type: 'merchant' as const,
    items: items.map((i) => ({ ...i, currency: 'gold' })),
  });

  const makeItemInfo = (type: string) => ({
    name: 'test item',
    code: 'test',
    level: 1,
    type,
    subtype: '',
    description: '',
    tradeable: true,
  });

  beforeEach(() => {
    character = new SimpleMockCharacter();
    jest.clearAllMocks();
  });

  it('returns false and skips selling when getNpc fails', async () => {
    mockGetNpc.mockResolvedValue(new ApiError({ code: 404, message: 'Not found' }));

    const result = await makeObjective('fish_merchant').run();

    expect(result).toBe(false);
    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('skips items that have both buy_price and sell_price', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'minor_health_potion', buy_price: 600, sell_price: 20 }]) as any,
    );
    character.bankItems = { minor_health_potion: 50 };

    await makeObjective('fish_merchant').run();

    expect(mockGetItemInformation).not.toHaveBeenCalled();
    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('skips items with no stock in bank', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'shell', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = {};

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('skips item and continues when getItemInformation fails', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'shell', buy_price: null, sell_price: 120 },
        { code: 'golden_shrimp', buy_price: null, sell_price: 1000 },
      ]) as any,
    );
    character.bankItems = { shell: 10, golden_shrimp: 5 };

    mockGetItemInformation
      .mockResolvedValueOnce(new ApiError({ code: 500, message: 'error' }) as any)
      .mockResolvedValueOnce(makeItemInfo('resource') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledTimes(1);
    expect(character.withdrawNow).toHaveBeenCalledWith(5, 'golden_shrimp');
  });

  it('keeps all items of type utility', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'some_potion', buy_price: null, sell_price: 50 }]) as any,
    );
    character.bankItems = { some_potion: 20 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('utility') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('keeps all items of type consumable', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'food_item', buy_price: null, sell_price: 30 }]) as any,
    );
    character.bankItems = { food_item: 15 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('consumable') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('sells all items of non-equipment, non-utility type (e.g. resource)', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'shell', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = { shell: 30 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(30, 'shell');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('sell', 30, 'shell');
  });

  it('keeps 5 and sells the rest for equipment types', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'forest_ring', buy_price: null, sell_price: 150 }]) as any,
    );
    character.bankItems = { forest_ring: 8 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('ring') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(3, 'forest_ring');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('sell', 3, 'forest_ring');
  });

  it.each(['weapon', 'helmet', 'body_armor', 'ring'] as const)(
    'keeps 5 for equipment type: %s',
    async (equipType) => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([{ code: 'some_gear', buy_price: null, sell_price: 500 }]) as any,
      );
      character.bankItems = { some_gear: 7 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo(equipType) as any);

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(2, 'some_gear');
    },
  );

  it('skips equipment item when bank quantity is already at or below 5', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'forest_ring', buy_price: null, sell_price: 150 }]) as any,
    );
    character.bankItems = { forest_ring: 4 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('ring') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('caps withdrawal at 90% of inventory_max_items when sell quantity exceeds it', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'shell', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = { shell: 200 };
    character.data.inventory_max_items = 100;
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(90, 'shell');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('sell', 90, 'shell');
  });

  it('continues to next item when withdrawNow fails', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'shell', buy_price: null, sell_price: 120 },
        { code: 'golden_shrimp', buy_price: null, sell_price: 1000 },
      ]) as any,
    );
    character.bankItems = { shell: 10, golden_shrimp: 5 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
    character.withdrawNow.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await makeObjective('fish_merchant').run();

    expect(character.tradeWithNpcNow).toHaveBeenCalledTimes(1);
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('sell', 5, 'golden_shrimp');
  });

  it('deposits gold after selling', async () => {
    mockGetNpc.mockResolvedValue(makeNpcResponse([]) as any);

    await makeObjective('fish_merchant').run();

    expect(character.depositNow).toHaveBeenCalledWith(0, 'gold');
  });

  it('sets fishMerchantTradeDate on success', async () => {
    const before = Math.round(Date.now() / 1000);
    mockGetNpc.mockResolvedValue(makeNpcResponse([]) as any);

    await makeObjective('fish_merchant').run();

    expect(character.fishMerchantTradeDate).toBeGreaterThanOrEqual(before);
  });

  it('sets nomadicMerchantTradeDate on success', async () => {
    const before = Math.round(Date.now() / 1000);
    mockGetNpc.mockResolvedValue(makeNpcResponse([]) as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.nomadicMerchantTradeDate).toBeGreaterThanOrEqual(before);
  });

  it('does not set fishMerchantTradeDate when getNpc fails', async () => {
    character.fishMerchantTradeDate = 0;
    mockGetNpc.mockResolvedValue(new ApiError({ code: 404, message: 'Not found' }));

    await makeObjective('fish_merchant').run();

    expect(character.fishMerchantTradeDate).toBe(0);
  });
});
