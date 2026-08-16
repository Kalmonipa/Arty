import { BankQuantityCacheTtlMs } from '../constants.js';

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
