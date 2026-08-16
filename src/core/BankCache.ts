import type { Character } from '../character/character.js';
import type { SimpleItemSchema } from '../types/types.js';

/**
 * @description A snapshot of the bank's item quantities, built once and read
 * many times. Lets a batch operation (e.g. gear evaluation) avoid firing a
 * separate bank API call per item it checks.
 */
export class BankCache {
  private readonly quantities: Map<string, number>;

  /**
   * True when the snapshot could not be read (typically a 429) and every
   * quantity therefore reads 0. Callers that would act on the numbers must
   * check this and back off; the cache stays a real object so that a failed
   * read can never degrade into a live API call per item.
   */
  readonly stale: boolean;

  private constructor(quantities: Map<string, number>, stale: boolean) {
    this.quantities = quantities;
    this.stale = stale;
  }

  /** A snapshot built from bank items already in hand, costing no API call. */
  static fromItems(items: SimpleItemSchema[]): BankCache {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(
        item.code,
        (quantities.get(item.code) ?? 0) + item.quantity,
      );
    }
    return new BankCache(quantities, false);
  }

  static async create(character: Character): Promise<BankCache> {
    const items = await character.getAllBankItems();
    if (items === undefined) {
      return new BankCache(new Map(), true);
    }

    return BankCache.fromItems(items);
  }

  quantityOf(code: string): number {
    return this.quantities.get(code) ?? 0;
  }

  remove(code: string, quantity = 1): void {
    const remaining = this.quantityOf(code) - quantity;
    this.quantities.set(code, Math.max(0, remaining));
  }
}
