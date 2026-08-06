import { jest } from '@jest/globals';
import { BankCache } from '../../src/core/BankCache.js';
import { Character } from '../../src/character/CharacterClass.js';
import { SimpleItemSchema } from '../../src/types/types.js';

const characterWithBank = (items: SimpleItemSchema[] | undefined): Character =>
  ({ getAllBankItems: jest.fn(async () => items) }) as unknown as Character;

describe('BankCache', () => {
  it('builds from bank items and reports quantities by code', async () => {
    const cache = await BankCache.create(
      characterWithBank([
        { code: 'copper_ore', quantity: 12 },
        { code: 'ash_wood', quantity: 3 },
      ]),
    );

    expect(cache).toBeDefined();
    expect(cache!.quantityOf('copper_ore')).toBe(12);
    expect(cache!.quantityOf('ash_wood')).toBe(3);
  });

  it('returns 0 for a code not present in the bank', async () => {
    const cache = await BankCache.create(characterWithBank([]));
    expect(cache!.quantityOf('skull_ring')).toBe(0);
  });

  it('sums quantities when a code appears in multiple entries', async () => {
    const cache = await BankCache.create(
      characterWithBank([
        { code: 'skull_ring', quantity: 2 },
        { code: 'skull_ring', quantity: 3 },
      ]),
    );
    expect(cache!.quantityOf('skull_ring')).toBe(5);
  });

  it('marks the cache stale when the bank fetch fails', async () => {
    const cache = await BankCache.create(characterWithBank(undefined));

    expect(cache.stale).toBe(true);
  });

  it('reports a successful snapshot as not stale', async () => {
    const cache = await BankCache.create(
      characterWithBank([{ code: 'copper_ore', quantity: 1 }]),
    );

    expect(cache.stale).toBe(false);
  });

  it('reports 0 for every code in a stale cache rather than guessing', async () => {
    const cache = await BankCache.create(characterWithBank(undefined));

    expect(cache.quantityOf('skull_ring')).toBe(0);
  });

  it('remove decrements the cached quantity', async () => {
    const cache = await BankCache.create(
      characterWithBank([{ code: 'skull_ring', quantity: 4 }]),
    );
    cache!.remove('skull_ring', 1);
    expect(cache!.quantityOf('skull_ring')).toBe(3);
  });

  it('remove defaults to 1 and never goes below 0', async () => {
    const cache = await BankCache.create(
      characterWithBank([{ code: 'skull_ring', quantity: 1 }]),
    );
    cache!.remove('skull_ring');
    expect(cache!.quantityOf('skull_ring')).toBe(0);
    cache!.remove('skull_ring');
    expect(cache!.quantityOf('skull_ring')).toBe(0);
  });
});
