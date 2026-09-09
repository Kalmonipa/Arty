import { Character } from '../../src/character/character.js';
import { BankCache } from '../../src/core/BankCache.js';
import { ItemSchema } from '../../src/types/types.js';
import {
  BossFightPotionReserve,
  BossFightReserveMaxShare,
  MaxEquippedUtilities,
} from '../../src/constants.js';

const potion = (code: string): ItemSchema =>
  ({ code, name: code, type: 'utility', subtype: 'potion' }) as ItemSchema;

const bankHolding = (contents: Record<string, number>): BankCache =>
  ({ quantityOf: (code: string) => contents[code] ?? 0 }) as BankCache;

const spareFor = (
  banked: Record<string, number>,
  forBossFight = false,
): number => {
  const character = {
    utilitiesMap: {
      restore: [potion('health_potion'), potion('greater_health_potion')],
    },
  } as unknown as Character;

  return (
    Character.prototype as unknown as {
      spareOutsideBossReserve: (
        utilityType: string,
        bankContents: BankCache,
        forBossFight: boolean,
      ) => number;
    }
  ).spareOutsideBossReserve.call(
    character,
    'restore',
    bankHolding(banked),
    forBossFight,
  );
};

describe('spareOutsideBossReserve', () => {
  const configured = BossFightPotionReserve.restore;

  it('holds back the full reserve while the bank can afford it', () => {
    // Twice the reserve, so the share never binds and the reserve is intact
    const banked = configured * 2;

    expect(spareFor({ greater_health_potion: banked })).toBe(
      banked - configured,
    );
  });

  it('leaves ordinary fights a share when stock is below the reserve', () => {
    // The state LongLegLarry stalled in: 156 banked against a 300 reserve
    const spare = spareFor({ greater_health_potion: 156 });

    expect(spare).toBe(156 - Math.floor(156 * BossFightReserveMaxShare));
    expect(spare).toBeGreaterThan(0);
  });

  it('never lets the reserve claim the whole stock', () => {
    for (const banked of [1, 20, 156, 299, configured]) {
      expect(spareFor({ greater_health_potion: banked })).toBeGreaterThan(0);
    }
  });

  it('counts the stock across every tier', () => {
    expect(spareFor({ greater_health_potion: 100, health_potion: 56 })).toBe(
      spareFor({ greater_health_potion: 156 }),
    );
  });

  it('gives a boss fight the whole stock, reserve included', () => {
    expect(spareFor({ greater_health_potion: 156 }, true)).toBe(
      MaxEquippedUtilities,
    );
  });
});
