# Currency Reserve in sellToMerchant

## Context

`EventObjective.sellToMerchant` sells items from the bank to a merchant NPC. Some items (e.g. `small_pearls`) can be sold to a merchant but are also used as **currency** to buy other items from NPCs. Selling all of them would leave the character unable to make purchases that require that currency.

## Goal

Before selling an item, check if it is used as a currency by any NPC. If so, reserve enough of it in the bank to afford the most expensive item that uses it as currency (max `buy_price`), and only sell the remainder.

## Design

### Where the change lives

`src/core/EventObjective.ts` — inside the `sellToMerchant` private method, within the existing per-item loop.

### Logic change

After fetching `itemInfoResponse` (which already happens per item), add a currency reserve step before computing `numToSell`:

1. Call `getAllNpcItems({ currency: npcItem.code })` from `src/api_calls/NPC.ts`.
2. If the call succeeds and returns results, compute:
   ```
   currencyReserve = max(item.buy_price for all items where buy_price != null)
   ```
   If no results or call fails (log a warning), `currencyReserve = 0`.
3. Compute `numAvailableToSell = numInBank - currencyReserve`.
4. If `numAvailableToSell <= 0`, log that we're reserving all for currency use and `continue`.
5. Apply the existing type-based keep logic using `numAvailableToSell` instead of `numInBank`:
   - `keepAllTypes` → skip (unchanged, already continues before this point)
   - `keepEquipmentTypes` → `numToSell = max(0, numAvailableToSell - keepQuantity)`
   - otherwise → `numToSell = numAvailableToSell`

### Import addition

Add `getAllNpcItems` to the existing `getNpc` import from `'../api_calls/NPC.js'`.

## Constraints

- The `getAllNpcItems` `params.currency` field accepts the item code as a string.
- The reserve quantity is the **maximum** `buy_price` across all NPC items that use this item as currency (so the character can afford any of them, not just the cheapest).
- API errors from the currency check are non-fatal: log a warning and proceed with `currencyReserve = 0`.
- No new methods or abstractions are introduced — the logic stays inline in the existing loop.
