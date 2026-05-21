# Currency Reserve in sellToMerchant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before selling an item to a merchant NPC, check if it is used as a currency by any NPC and reserve enough of it in the bank to afford the most expensive item that uses it as currency.

**Architecture:** Add a `getAllNpcItems({ currency: itemCode })` call inside the existing per-item loop in `sellToMerchant`. The currency reserve (max `buy_price` across all results) is subtracted from `numInBank` to produce `numAvailableToSell`, which replaces `numInBank` in the sell calculation. API errors from the currency check are non-fatal.

**Tech Stack:** TypeScript, Jest

---

### Task 1: Update NPC mock and add failing tests

**Files:**
- Modify: `tests/integration/EventObjective.test.ts`

- [ ] **Step 1: Add `getAllNpcItems` to the NPC module mock factory**

In `tests/integration/EventObjective.test.ts`, update the `jest.mock` call at the top from:

```typescript
jest.mock('../../src/api_calls/NPC', () => ({
  getNpc: jest.fn(),
}));
```

to:

```typescript
jest.mock('../../src/api_calls/NPC', () => ({
  getNpc: jest.fn(),
  getAllNpcItems: jest.fn(),
}));
```

- [ ] **Step 2: Import and type the `getAllNpcItems` mock**

After the existing import lines:

```typescript
import { getNpc } from '../../src/api_calls/NPC.js';
import { getItemInformation } from '../../src/api_calls/Items.js';
```

Add:

```typescript
import { getAllNpcItems } from '../../src/api_calls/NPC.js';
```

After the existing mock variable declarations:

```typescript
const mockGetNpc = getNpc as jest.MockedFunction<typeof getNpc>;
const mockGetItemInformation = getItemInformation as jest.MockedFunction<typeof getItemInformation>;
```

Add:

```typescript
const mockGetAllNpcItems = getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>;
```

- [ ] **Step 3: Set default mock return in `beforeEach` so existing tests keep passing**

Update the `beforeEach` block from:

```typescript
beforeEach(() => {
  character = new SimpleMockCharacter();
  jest.clearAllMocks();
});
```

to:

```typescript
beforeEach(() => {
  character = new SimpleMockCharacter();
  jest.clearAllMocks();
  mockGetAllNpcItems.mockResolvedValue({ data: [], total: 0, page: 1, size: 50 } as any);
});
```

- [ ] **Step 4: Add failing tests for currency reserve logic**

At the end of the `describe` block (after the last existing `it` block, before the closing `}`), add:

```typescript
describe('currency reserve', () => {
  const makeCurrencyUsageResponse = (items: { buy_price: number | null }[]) => ({
    data: items.map((i) => ({ code: 'small_pearls', npc: 'fish_merchant', currency: 'gold', ...i })),
    total: items.length,
    page: 1,
    size: 50,
  });

  it('sells full amount when item is not used as currency', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = { small_pearls: 20 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
    mockGetAllNpcItems.mockResolvedValue(makeCurrencyUsageResponse([]) as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
  });

  it('reserves max buy_price and sells the remainder when item is used as currency', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
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
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
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
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
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
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
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
      makeNpcResponse([{ code: 'some_ring', buy_price: null, sell_price: 500 }]) as any,
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
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = { small_pearls: 20 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
    mockGetAllNpcItems.mockResolvedValue(new ApiError({ code: 500, message: 'error' }) as any);

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
  });

  it('ignores currency entries with null buy_price', async () => {
    mockGetNpc.mockResolvedValue(
      makeNpcResponse([{ code: 'small_pearls', buy_price: null, sell_price: 120 }]) as any,
    );
    character.bankItems = { small_pearls: 20 };
    mockGetItemInformation.mockResolvedValue(makeItemInfo('resource') as any);
    mockGetAllNpcItems.mockResolvedValue(
      makeCurrencyUsageResponse([{ buy_price: null }]) as any,
    );

    await makeObjective('fish_merchant').run();

    expect(character.withdrawNow).toHaveBeenCalledWith(20, 'small_pearls');
  });
});
```

- [ ] **Step 5: Run failing tests to confirm they fail for the right reason**

```bash
npx jest tests/integration/EventObjective.test.ts --no-coverage
```

Expected: The new currency reserve tests fail with something like `getAllNpcItems is not a function` or mock-related errors (because the implementation doesn't call it yet). Existing tests should still pass.

---

### Task 2: Implement the currency reserve logic

**Files:**
- Modify: `src/core/EventObjective.ts`

- [ ] **Step 1: Add `getAllNpcItems` to the import**

In `src/core/EventObjective.ts`, update the NPC import from:

```typescript
import { getNpc } from '../api_calls/NPC.js';
```

to:

```typescript
import { getAllNpcItems, getNpc } from '../api_calls/NPC.js';
```

- [ ] **Step 2: Add currency reserve logic inside `sellToMerchant`**

In `src/core/EventObjective.ts`, find this block inside `sellToMerchant` (lines ~276–289):

```typescript
      const itemType = itemInfoResponse.type;

      if (keepAllTypes.includes(itemType)) {
        logger.debug(`Keeping all ${numInBank} ${npcItem.code} (${itemType})`);
        continue;
      }

      const numToSell = keepEquipmentTypes.includes(itemType)
        ? Math.max(0, numInBank - keepQuantity)
        : numInBank;

      if (numToSell <= 0) {
        logger.info(`Keeping all ${numInBank} ${npcItem.code} (need to keep at least ${keepQuantity})`);
        continue;
      }
```

Replace it with:

```typescript
      const itemType = itemInfoResponse.type;

      if (keepAllTypes.includes(itemType)) {
        logger.debug(`Keeping all ${numInBank} ${npcItem.code} (${itemType})`);
        continue;
      }

      let currencyReserve = 0;
      const currencyUsageResponse = await getAllNpcItems({ currency: npcItem.code });
      if (currencyUsageResponse instanceof ApiError) {
        logger.warn(`Could not check currency usage for ${npcItem.code}, proceeding without reserve`);
      } else {
        const prices = currencyUsageResponse.data
          .map((item) => item.buy_price)
          .filter((price): price is number => price != null);
        if (prices.length > 0) {
          currencyReserve = Math.max(...prices);
          logger.debug(`Reserving ${currencyReserve} ${npcItem.code} for currency use`);
        }
      }

      const numAvailableToSell = numInBank - currencyReserve;
      if (numAvailableToSell <= 0) {
        logger.info(`Keeping all ${numInBank} ${npcItem.code} (reserved ${currencyReserve} for currency use)`);
        continue;
      }

      const numToSell = keepEquipmentTypes.includes(itemType)
        ? Math.max(0, numAvailableToSell - keepQuantity)
        : numAvailableToSell;

      if (numToSell <= 0) {
        logger.info(`Keeping all ${numInBank} ${npcItem.code} (need to keep at least ${keepQuantity})`);
        continue;
      }
```

- [ ] **Step 3: Run the full test suite and confirm all tests pass**

```bash
npx jest tests/integration/EventObjective.test.ts --no-coverage
```

Expected: All tests pass, including both the existing tests and the new currency reserve tests.

- [ ] **Step 4: Commit**

```bash
git add src/core/EventObjective.ts tests/integration/EventObjective.test.ts
git commit -m "feat: reserve currency items when selling to merchant"
```

---

### Task 3: Clean up

**Files:**
- Delete: `docs/` directory

- [ ] **Step 1: Remove the docs directory**

```bash
git rm -r docs/
git commit -m "chore: remove brainstorming docs"
```
