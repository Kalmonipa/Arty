import { jest } from '@jest/globals';
import { EventObjective } from '../../src/events/eventObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ApiError } from '../../src/core/Error.js';
import { ActiveEventSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/NPC', () => ({
  getNpc: jest.fn(),
  getAllNpcItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

import { getNpc, getAllNpcItems } from '../../src/api_calls/NPC.js';
import { getItemInformation } from '../../src/api_calls/Items.js';

const mockGetNpc = getNpc as jest.MockedFunction<typeof getNpc>;
const mockGetItemInformation = getItemInformation as jest.MockedFunction<
  typeof getItemInformation
>;
const mockGetAllNpcItems = getAllNpcItems as jest.MockedFunction<
  typeof getAllNpcItems
>;

const makeMerchantEvent = (
  code: 'fish_merchant' | 'nomadic_merchant',
): ActiveEventSchema =>
  ({
    code,
    name: code,
    expiration: new Date(Date.now() + 3_600_000).toISOString(),
    created_at: new Date().toISOString(),
    duration: 60,
    map: {
      map_id: 1,
      x: 0,
      y: 0,
      skin: '',
      layer: 'overworld',
      interactions: { content: null },
    },
    previous_map: {
      map_id: 1,
      x: 0,
      y: 0,
      skin: '',
      layer: 'overworld',
      interactions: {},
    },
  }) as unknown as ActiveEventSchema;

class SimpleMockCharacter {
  data = { ...mockCharacterData };
  allMaps = [{ map_id: mockCharacterData.map_id, x: 0, y: 0 }];
  fishMerchantTradeDate = 0;
  nomadicMerchantTradeDate = 0;
  role = 'fisherman';

  bankItems: Record<string, number> = {};

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    return this.bankItems[code] ?? 0;
  });

  checkQuantityOfItemInInv = jest.fn((_code: string): number => 0);

  withdrawNow = jest.fn(
    async (_qty: number, _code: string): Promise<boolean> => true,
  );
  tradeWithNpcNow = jest.fn(async (): Promise<boolean> => true);
  depositNow = jest.fn(async (): Promise<void> => {});
  equipNow = jest.fn(async (): Promise<boolean> => true);
  recordEventSuccess = jest.fn();
  recordEventFailure = jest.fn();
  getEquippedSlot = jest.fn((_code: string): string => null);
}

describe('EventObjective - sellToMerchant', () => {
  let character: SimpleMockCharacter;

  const makeObjective = (code: 'fish_merchant' | 'nomadic_merchant') =>
    new EventObjective(character as any, makeMerchantEvent(code));

  const makeNpcResponse = (
    items: {
      code: string;
      buy_price: number | null;
      sell_price: number | null;
    }[],
  ) => ({
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
    mockGetAllNpcItems.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      size: 50,
    } as any);
  });

  it('returns false and skips selling when getNpc fails', async () => {
    mockGetNpc.mockResolvedValue(
      new ApiError({ code: 404, message: 'Not found' }),
    );

    const result = await makeObjective('fish_merchant').run();

    expect(result).toBe(false);
    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('skips items that have both buy_price and sell_price', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'minor_health_potion', buy_price: 600, sell_price: 20 },
      ]) as any,
    );
    character.bankItems = { minor_health_potion: 50 };

    await makeObjective('fish_merchant').run();

    expect(mockGetItemInformation).not.toHaveBeenCalled();
    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('skips items with no stock in bank', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'shell', buy_price: null, sell_price: 120 },
      ]) as any,
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
      .mockResolvedValueOnce(
        new ApiError({ code: 500, message: 'error' }) as any,
      )
      .mockResolvedValueOnce(makeItemInfo('resource') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledTimes(1);
    expect(character.withdrawNow).toHaveBeenCalledWith(5, 'golden_shrimp');
  });

  it('keeps all items of type utility', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'some_potion', buy_price: null, sell_price: 50 },
      ]) as any,
    );
    character.bankItems = { some_potion: 20 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('utility') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('keeps all items of type consumable', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'food_item', buy_price: null, sell_price: 30 },
      ]) as any,
    );
    character.bankItems = { food_item: 15 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('consumable') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('sells all items of non-equipment, non-utility type (e.g. resource)', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'shell', buy_price: null, sell_price: 120 },
      ]) as any,
    );
    character.bankItems = { shell: 30 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(30, 'shell');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('sell', 30, 'shell');
  });

  it('keeps 5 and sells the rest for equipment types', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'forest_ring', buy_price: null, sell_price: 150 },
      ]) as any,
    );
    character.bankItems = { forest_ring: 8 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('ring') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(3, 'forest_ring');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
      'sell',
      3,
      'forest_ring',
    );
  });

  it.each(['weapon', 'helmet', 'body_armor', 'ring'] as const)(
    'keeps 5 for equipment type: %s',
    async (equipType) => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'some_gear', buy_price: null, sell_price: 500 },
        ]) as any,
      );
      character.bankItems = { some_gear: 7 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo(equipType) as any);

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(2, 'some_gear');
    },
  );

  it('skips equipment item when bank quantity is already at or below 5', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'forest_ring', buy_price: null, sell_price: 150 },
      ]) as any,
    );
    character.bankItems = { forest_ring: 4 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('ring') as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('caps withdrawal at 90% of inventory_max_items when sell quantity exceeds it', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([
        { code: 'shell', buy_price: null, sell_price: 120 },
      ]) as any,
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
    character.withdrawNow
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await makeObjective('fish_merchant').run();

    expect(character.tradeWithNpcNow).toHaveBeenCalledTimes(1);
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
      'sell',
      5,
      'golden_shrimp',
    );
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
    mockGetNpc.mockResolvedValue(
      new ApiError({ code: 404, message: 'Not found' }),
    );

    await makeObjective('fish_merchant').run();

    expect(character.fishMerchantTradeDate).toBe(0);
  });

  it('calls recordEventSuccess when fish_merchant event completes successfully', async () => {
    mockGetNpc.mockResolvedValue(makeNpcResponse([]) as any);

    await makeObjective('fish_merchant').run();

    expect(character.recordEventSuccess).toHaveBeenCalledWith('fish_merchant');
    expect(character.recordEventSuccess).toHaveBeenCalledTimes(1);
  });

  it('calls recordEventSuccess when nomadic_merchant event completes successfully', async () => {
    mockGetNpc.mockResolvedValue(makeNpcResponse([]) as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.recordEventSuccess).toHaveBeenCalledWith(
      'nomadic_merchant',
    );
  });

  it('does not call recordEventSuccess when fish_merchant getNpc fails', async () => {
    mockGetNpc.mockResolvedValue(
      new ApiError({ code: 404, message: 'Not found' }),
    );

    await makeObjective('fish_merchant').run();

    expect(character.recordEventSuccess).not.toHaveBeenCalled();
  });

  it('does not call recordEventFailure for merchant events (only fight losses trigger it)', async () => {
    mockGetNpc.mockResolvedValue(
      new ApiError({ code: 404, message: 'Not found' }),
    );

    await makeObjective('fish_merchant').run();

    expect(character.recordEventFailure).toHaveBeenCalled();
  });

  describe('currency reserve', () => {
    const makeCurrencyUsageResponse = (
      items: { buy_price: number | null }[],
    ) => ({
      data: items.map((i) => ({
        code: 'small_pearls',
        npc: 'fish_merchant',
        currency: 'gold',
        ...i,
      })),
      total: items.length,
      page: 1,
      size: 50,
    });

    it('sells full amount when item is not used as currency', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 20 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(mockGetAllNpcItems).toHaveBeenCalledWith({
        currency: 'small_pearls',
        size: 10000,
      });
      expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
    });

    it('reserves max buy_price and sells the remainder when item is used as currency', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 20 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: 5 }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(15, 'small_pearls');
    });

    it('reserves the maximum buy_price when item is currency for multiple items at different prices', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 30 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: 5 }, { buy_price: 10 }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
    });

    it('skips item entirely when currency reserve consumes all bank stock', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 5 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: 5 }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).not.toHaveBeenCalled();
    });

    it('skips item when currency reserve exceeds bank stock', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 3 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: 5 }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).not.toHaveBeenCalled();
    });

    it('applies currency reserve before equipment keep quantity', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'some_ring', buy_price: null, sell_price: 500 },
        ]) as any,
      );
      // bank: 12, currency reserve: 3, available: 9, keep 5 equipment → sell 4
      character.bankItems = { some_ring: 12 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('ring') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: 3 }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(4, 'some_ring');
    });

    it('sells normally when getAllNpcItems returns an ApiError', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 20 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        new ApiError({ code: 500, message: 'error' }) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
    });

    it('ignores currency entries with null buy_price', async () => {
      mockGetNpc.mockResolvedValue(
        makeNpcResponse([
          { code: 'small_pearls', buy_price: null, sell_price: 120 },
        ]) as any,
      );
      character.bankItems = { small_pearls: 20 };
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
      mockGetAllNpcItems.mockResolvedValue(
        makeCurrencyUsageResponse([{ buy_price: null }]) as any,
      );

      await makeObjective('fish_merchant').run();

      expect(mockGetAllNpcItems).toHaveBeenCalledWith({
        currency: 'small_pearls',
        size: 10000,
      });
      expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
    });
  });

  describe('buyFromNomadicMerchant', () => {
    // The buy step relies on getNpc (the preceding sell step), getItemInformation
    // (level conditions), and getAllNpcItems (the buy price). It buys the hardcoded
    // codes 'backpack' and 'lost_world_map' directly.

    // getNpc response for the sell step that runs before buying. No sellable items
    // (sell_price null) so the sell step succeeds and buying proceeds.
    const makeMerchantNpc = () => ({
      name: 'Nomadic Merchant',
      code: 'nomadic_merchant',
      description: '',
      type: 'merchant' as const,
      items: [],
    });

    // getAllNpcItems response shape: { data: [{ code, buy_price, ... }], ... }
    const makeNpcBuyResponse = (buyPrice: number | null) => ({
      data:
        buyPrice == null
          ? []
          : [
              {
                code: 'test',
                npc: 'nomadic_merchant',
                currency: 'gold',
                buy_price: buyPrice,
              },
            ],
      total: 1,
      page: 1,
      size: 50,
    });

    // Drive getAllNpcItems to return a buy price per requested item code.
    // Codes not listed are treated as not for sale (empty data).
    const mockBuyPrices = (prices: Record<string, number | null>) => {
      mockGetAllNpcItems.mockImplementation(async (params: any) => {
        const code = params?.code;
        const buyPrice = code in prices ? prices[code] : null;
        return makeNpcBuyResponse(buyPrice) as any;
      });
    };

    const makeItemInfoWithLevel = (level: number) => ({
      ...makeItemInfo('resource'),
      conditions: [{ code: 'level', value: level }],
    });

    beforeEach(() => {
      mockGetNpc.mockResolvedValue(makeMerchantNpc() as any);
      // No level conditions by default
      mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
    });

    it('buys backpack when not owned and affordable, and equips it to the bag slot', async () => {
      character.data.bag_slot = '';
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.equipNow).toHaveBeenCalledWith('backpack', 'bag');
    });

    it('buys backpack but does not equip when the bag slot is occupied', async () => {
      character.data.bag_slot = 'some_other_bag';
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.equipNow).not.toHaveBeenCalledWith('backpack', 'bag');
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips backpack when already equipped', async () => {
      character.getEquippedSlot.mockImplementation(() => 'bag_slot');
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips backpack when present in inventory', async () => {
      character.checkQuantityOfItemInInv.mockImplementation((code: string) =>
        code === 'backpack' ? 1 : 0,
      );
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips backpack when present in bank', async () => {
      character.bankItems = { backpack: 1 };
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips an item the merchant does not sell', async () => {
      character.data.bag_slot = '';
      // Neither code priced -> not for sale
      mockBuyPrices({});

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalled();
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips an item the character cannot afford', async () => {
      character.data.gold = 50;
      character.data.bag_slot = '';
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('skips an item whose level requirement is above the character level', async () => {
      character.data.level = 10;
      character.data.bag_slot = '';
      mockGetItemInformation.mockResolvedValue(
        makeItemInfoWithLevel(20) as any,
      );
      mockBuyPrices({ backpack: 100 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('continues to the next item (and succeeds) when getItemInformation returns an ApiError', async () => {
      character.data.bag_slot = '';
      mockGetItemInformation.mockResolvedValue(
        new ApiError({ code: 500, message: 'error' }) as any,
      );
      mockBuyPrices({ backpack: 100, lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalled();
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('buys lost_world_map when not owned and equips it to the first free artifact slot', async () => {
      character.data.artifact1_slot = '';
      mockBuyPrices({ lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'lost_world_map',
      );
      expect(character.equipNow).toHaveBeenCalledWith(
        'lost_world_map',
        'artifact1',
      );
    });

    it('equips lost_world_map to the next free artifact slot when earlier slots are full', async () => {
      character.data.artifact1_slot = 'other_artifact';
      character.data.artifact2_slot = '';
      mockBuyPrices({ lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.equipNow).toHaveBeenCalledWith(
        'lost_world_map',
        'artifact2',
      );
    });

    it('skips lost_world_map when already equipped', async () => {
      character.getEquippedSlot.mockImplementation(() => 'artifact_1_slot');
      mockBuyPrices({ lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith(
        'buy',
        1,
        'lost_world_map',
      );
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('buys lost_world_map but does not equip when all artifact slots are full', async () => {
      character.data.artifact1_slot = 'a1';
      character.data.artifact2_slot = 'a2';
      character.data.artifact3_slot = 'a3';
      mockBuyPrices({ lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'lost_world_map',
      );
      expect(character.equipNow).not.toHaveBeenCalled();
      expect(character.recordEventSuccess).toHaveBeenCalledWith(
        'nomadic_merchant',
      );
    });

    it('buys both backpack and lost_world_map when both are available and affordable', async () => {
      character.data.bag_slot = '';
      character.data.artifact1_slot = '';
      mockBuyPrices({ backpack: 100, lost_world_map: 500 });

      await makeObjective('nomadic_merchant').run();

      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'backpack',
      );
      expect(character.tradeWithNpcNow).toHaveBeenCalledWith(
        'buy',
        1,
        'lost_world_map',
      );
    });
  });
});
