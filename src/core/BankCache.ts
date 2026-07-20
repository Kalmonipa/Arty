import type { Character } from '../character/characterClass.js';

/**
 * @description A snapshot of the bank's item quantities, built once and read
 * many times. Lets a batch operation (e.g. gear evaluation) avoid firing a
 * separate bank API call per item it checks.
 */
export class BankCache {
  private readonly quantities: Map<string, number>;

  private constructor(quantities: Map<string, number>) {
    this.quantities = quantities;
  }

  static async create(character: Character): Promise<BankCache | undefined> {
    const items = await character.getAllBankItems();
    if (items === undefined) {
      return undefined;
    }

    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(
        item.code,
        (quantities.get(item.code) ?? 0) + item.quantity,
      );
    }
    return new BankCache(quantities);
  }

  quantityOf(code: string): number {
    return this.quantities.get(code) ?? 0;
  }

  remove(code: string, quantity = 1): void {
    const remaining = this.quantityOf(code) - quantity;
    this.quantities.set(code, Math.max(0, remaining));
  }
}
