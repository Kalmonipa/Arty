# Nomadic Merchant Purchases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After selling to the nomadic merchant, each character buys a backpack (if bag slot is empty) and a `lost_world_map` (if not already owned anywhere).

**Architecture:** Add a private `buyFromNomadicMerchant()` method to `EventObjective`. `sellToNomadicMerchant` calls it after `sellToMerchant` succeeds. The method fetches the merchant's buyable items via `getNpc`, finds a bag-type item via `getItemInformation`, and checks equipped slots + inventory + bank before buying `lost_world_map`. Both `getNpc` and `getItemInformation` are already imported.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Add `checkQuantityOfItemInInv` to mock and write failing tests

**Files:**
- Modify: `tests/integration/EventObjective.test.ts`

- [ ] **Step 1: Add `checkQuantityOfItemInInv` to `SimpleMockCharacter`**

In `tests/integration/EventObjective.test.ts`, update `SimpleMockCharacter` from:

```typescript
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
  recordEventSuccess = jest.fn();
  recordEventFailure = jest.fn();
}
```

to:

```typescript
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  allMaps = [{ map_id: mockCharacterData.map_id, x: 0, y: 0 }];
  fishMerchantTradeDate = 0;
  nomadicMerchantTradeDate = 0;

  bankItems: Record<string, number> = {};

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    return this.bankItems[code] ?? 0;
  });

  checkQuantityOfItemInInv = jest.fn((_code: string): number => 0);

  withdrawNow = jest.fn(async (_qty: number, _code: string): Promise<boolean> => true);
  tradeWithNpcNow = jest.fn(async (): Promise<void> => {});
  depositNow = jest.fn(async (): Promise<void> => {});
  recordEventSuccess = jest.fn();
  recordEventFailure = jest.fn();
}
```

- [ ] **Step 2: Add a `describe('buyFromNomadicMerchant')` block with failing tests**

At the end of the top-level `describe('EventObjective - sellToMerchant')` block (after the closing `}` of `describe('currency reserve')`), add:

```typescript
describe('buyFromNomadicMerchant', () => {
  const makeBuyableNpcResponse = (items: { code: string; buy_price: number | null }[]) => ({
    name: 'Nomadic Merchant',
    code: 'nomadic_merchant',
    description: '',
    type: 'merchant' as const,
    items: items.map((i) => ({ ...i, sell_price: null, currency: 'gold' })),
  });

  it('buys backpack when bag_slot is empty and merchant sells a bag', async () => {
    character.data.bag_slot = '';
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'leather_bag', buy_price: 100 }]) as any,
    );
    mockGetItemInformation.mockResolvedValue(makeItemInfo('bag') as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('buy', 1, 'leather_bag');
  });

  it('skips backpack purchase when bag_slot is already occupied', async () => {
    character.data.bag_slot = 'leather_bag';
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'leather_bag', buy_price: 100 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith('buy', 1, 'leather_bag');
  });

  it('skips backpack purchase when merchant has no bag-type items', async () => {
    character.data.bag_slot = '';
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'some_item', buy_price: 50 }]) as any,
    );
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalled();
  });

  it('buys lost_world_map when not equipped, not in inventory, not in bank', async () => {
    character.data.bag_slot = 'some_bag';
    character.checkQuantityOfItemInInv.mockReturnValue(0);
    character.bankItems = {};
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'lost_world_map', buy_price: 500 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });

  it('skips lost_world_map when equipped in an equipment slot', async () => {
    character.data.bag_slot = 'some_bag';
    character.data.artifact1_slot = 'lost_world_map';
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'lost_world_map', buy_price: 500 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });

  it('skips lost_world_map when present in inventory', async () => {
    character.data.bag_slot = 'some_bag';
    character.checkQuantityOfItemInInv.mockReturnValue(1);
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'lost_world_map', buy_price: 500 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });

  it('skips lost_world_map when present in bank', async () => {
    character.data.bag_slot = 'some_bag';
    character.checkQuantityOfItemInInv.mockReturnValue(0);
    character.bankItems = { lost_world_map: 1 };
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'lost_world_map', buy_price: 500 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });

  it('skips lost_world_map when merchant does not have it for sale', async () => {
    character.data.bag_slot = 'some_bag';
    character.checkQuantityOfItemInInv.mockReturnValue(0);
    character.bankItems = {};
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'other_item', buy_price: 50 }]) as any,
    );

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });

  it('continues without buying backpack when getItemInformation returns ApiError', async () => {
    character.data.bag_slot = '';
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([{ code: 'leather_bag', buy_price: 100 }]) as any,
    );
    mockGetItemInformation.mockResolvedValue(new ApiError({ code: 500, message: 'error' }) as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).not.toHaveBeenCalled();
  });

  it('buys both backpack and lost_world_map when both conditions are met', async () => {
    character.data.bag_slot = '';
    character.checkQuantityOfItemInInv.mockReturnValue(0);
    character.bankItems = {};
    mockGetNpc.mockResolvedValue(
      makeBuyableNpcResponse([
        { code: 'leather_bag', buy_price: 100 },
        { code: 'lost_world_map', buy_price: 500 },
      ]) as any,
    );
    mockGetItemInformation.mockResolvedValue(makeItemInfo('bag') as any);

    await makeObjective('nomadic_merchant').run();

    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('buy', 1, 'leather_bag');
    expect(character.tradeWithNpcNow).toHaveBeenCalledWith('buy', 1, 'lost_world_map');
  });
});
```

- [ ] **Step 3: Run failing tests to confirm they fail for the right reason**

```bash
npx jest tests/integration/EventObjective.test.ts --no-coverage
```

Expected: The new `buyFromNomadicMerchant` tests fail (method doesn't exist yet). All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/EventObjective.test.ts
git commit -m "test: add failing tests for nomadic merchant purchase logic"
```

---

### Task 2: Implement `buyFromNomadicMerchant`

**Files:**
- Modify: `src/core/EventObjective.ts`

- [ ] **Step 1: Update `sellToNomadicMerchant` to call `buyFromNomadicMerchant`**

Find this method (around line 236):

```typescript
  private async sellToNomadicMerchant(): Promise<boolean> {
    const success = await this.sellToMerchant('nomadic_merchant');
    if (success) {
      this.character.nomadicMerchantTradeDate = Math.round(Date.now() / 1000);
    }
    return success;
  }
```

Replace it with:

```typescript
  private async sellToNomadicMerchant(): Promise<boolean> {
    const success = await this.sellToMerchant('nomadic_merchant');
    if (success) {
      await this.buyFromNomadicMerchant();
      this.character.nomadicMerchantTradeDate = Math.round(Date.now() / 1000);
    }
    return success;
  }
```

- [ ] **Step 2: Add the `buyFromNomadicMerchant` private method**

Insert the following method immediately after `sellToNomadicMerchant` (before `sellToMerchant`):

```typescript
  /**
   * @description Buy a backpack (if bag slot is empty) and a lost_world_map
   * (if not already equipped, in inventory, or in bank) from the nomadic merchant.
   */
  private async buyFromNomadicMerchant(): Promise<void> {
    const npcResponse = await getNpc('nomadic_merchant');
    if (npcResponse instanceof ApiError) {
      logger.warn('Could not fetch nomadic_merchant details for purchase');
      return;
    }

    const buyableItems = (npcResponse.items ?? []).filter(
      (item) => item.buy_price != null,
    );

    if (!this.character.data.bag_slot) {
      for (const item of buyableItems) {
        const itemInfo = await getItemInformation(item.code);
        if (itemInfo instanceof ApiError) {
          logger.warn(`Could not get item info for ${item.code}, skipping`);
          continue;
        }
        if (itemInfo.type === 'bag') {
          logger.info(`Buying bag: ${item.code}`);
          await this.character.tradeWithNpcNow('buy', 1, item.code);
          break;
        }
      }
    }

    const mapForSale = buyableItems.find((item) => item.code === 'lost_world_map');
    if (mapForSale) {
      const equippedItems = [
        this.character.data.weapon_slot,
        this.character.data.rune_slot,
        this.character.data.shield_slot,
        this.character.data.helmet_slot,
        this.character.data.body_armor_slot,
        this.character.data.leg_armor_slot,
        this.character.data.boots_slot,
        this.character.data.ring1_slot,
        this.character.data.ring2_slot,
        this.character.data.amulet_slot,
        this.character.data.artifact1_slot,
        this.character.data.artifact2_slot,
        this.character.data.artifact3_slot,
        this.character.data.utility1_slot,
        this.character.data.utility2_slot,
        this.character.data.bag_slot,
      ];
      const isEquipped = equippedItems.includes('lost_world_map');
      const inInv = this.character.checkQuantityOfItemInInv('lost_world_map') > 0;
      const inBank = (await this.character.checkQuantityOfItemInBank('lost_world_map')) > 0;

      if (!isEquipped && !inInv && !inBank) {
        logger.info('Buying lost_world_map from nomadic merchant');
        await this.character.tradeWithNpcNow('buy', 1, 'lost_world_map');
      }
    }
  }
```

- [ ] **Step 3: Run all tests and confirm they pass**

```bash
npx jest tests/integration/EventObjective.test.ts --no-coverage
```

Expected: All tests pass, including all new `buyFromNomadicMerchant` tests.

- [ ] **Step 4: Commit**

```bash
git add src/core/EventObjective.ts
git commit -m "feat: buy backpack and lost_world_map from nomadic merchant"
```
