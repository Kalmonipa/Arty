import { BankQuantityCacheTtlMs } from '../constants.js';
import type { SimpleItemSchema } from '../types/types.js';

/**
 * @description A short lived memo of per-item bank quantities.
 *
 * Most bank lookups re-read a code we read moments ago: loops re-checking the
 * same potion or ore rather than scanning the whole bank. Those repeats are what
 * push the host over the API's per-minute data budget, which is shared by every
 * character's container because the limit is applied per IP.
 *
 * An entry is dropped as soon as this character banks that item. Another
 * character can still bank one behind our back and leave us reading a stale
 * number, but a live read was already stale by the time the withdraw landed, so
 * this widens an existing race rather than introducing a new one.
 *
 * Prefer a {@link BankCache} snapshot when a single operation needs many
 * different codes at once; this cache is for the same code read repeatedly.
 */
const quantities = new Map<string, { quantity: number; readAt: number }>();

export function readCachedBankQuantity(code: string): number | undefined {
  const cached = quantities.get(code);

  if (!cached) {
    return undefined;
  }

  if (Date.now() - cached.readAt >= BankQuantityCacheTtlMs) {
    quantities.delete(code);
    return undefined;
  }

  return cached.quantity;
}

export function cacheBankQuantity(code: string, quantity: number): void {
  quantities.set(code, { quantity, readAt: Date.now() });
}

/**
 * Called for every item this character moves in or out of the bank, so the next
 * read of those codes goes back to the API.
 */
export function invalidateBankQuantities(codes: string[]): void {
  for (const code of codes) {
    quantities.delete(code);
  }
  // The full listing is a superset of these codes, so any movement dates it too.
  clearBankSnapshot();
}

/** Test seam: drop every entry so each test starts from a clean fetch. */
export function clearBankQuantityCache(): void {
  quantities.clear();
}

/**
 * @description A memo of how many bank slots are occupied.
 *
 * Separate from the per-item quantities above because it answers a different
 * question — how full is the bank, not how much of X is in it — and because the
 * bank-expansion check reads it on a path that a full bank drives hard. Left
 * uncached it costs a listing per failed deposit, which is what exhausted the
 * data budget for the whole fleet.
 */
let slotsUsed: { count: number; readAt: number } | undefined;

export function readCachedBankSlotsUsed(): number | undefined {
  if (!slotsUsed) {
    return undefined;
  }

  if (Date.now() - slotsUsed.readAt >= BankQuantityCacheTtlMs) {
    slotsUsed = undefined;
    return undefined;
  }

  return slotsUsed.count;
}

export function cacheBankSlotsUsed(count: number): void {
  slotsUsed = { count, readAt: Date.now() };
}

/** Test seam: forget the slot count so each case starts from a clean fetch. */
export function clearBankSlotCache(): void {
  slotsUsed = undefined;
}

/**
 * @description A memo of the whole bank listing.
 *
 * Separate again from the two above: this answers "what is in the bank", which
 * costs a call per page rather than a single lookup. A gear evaluation reads
 * dozens of codes and so builds a {@link BankCache} from a full listing, and it
 * re-entered often enough to spend the fleet's entire hourly data budget on
 * paging the bank. The per-item memo above never covered it, because a full
 * listing asks for no particular code.
 *
 * Read through {@link BankCache.fromItems} so each caller gets its own map to
 * spend down; handing out one shared snapshot would let one caller's planned
 * withdrawals disappear from another's view. The cross-character staleness noted
 * above applies here too, and for the same reason is not made worse by memoing.
 */
let snapshot: { items: SimpleItemSchema[]; readAt: number } | undefined;

export function readCachedBankSnapshot(): SimpleItemSchema[] | undefined {
  if (!snapshot) {
    return undefined;
  }

  if (Date.now() - snapshot.readAt >= BankQuantityCacheTtlMs) {
    snapshot = undefined;
    return undefined;
  }

  return snapshot.items;
}

export function cacheBankSnapshot(items: SimpleItemSchema[]): void {
  snapshot = { items, readAt: Date.now() };
}

/** Test seam: forget the listing so each case starts from a clean fetch. */
export function clearBankSnapshot(): void {
  snapshot = undefined;
}
