import { Character } from '../../src/character/character.js';
import { BankCache } from '../../src/core/BankCache.js';
import { ItemSchema } from '../../src/types/types.js';
import {
  BossFightPotionReserve,
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
    const banked = configured * 2;

    expect(spareFor({ greater_health_potion: banked })).toBe(
      banked - configured,
    );
  });

  it('refuses ordinary fights anything once stock is down to the reserve', () => {
    // The whole point of the floor: the raid party finds 300 waiting for it
    // however hard the rest of the fleet has been fighting
    expect(spareFor({ greater_health_potion: configured })).toBe(0);
  });

  it('refuses ordinary fights anything below the reserve', () => {
    for (const banked of [1, 20, 156, configured - 1]) {
      expect(spareFor({ greater_health_potion: banked })).toBe(0);
    }
  });

  it('counts the stock across every tier', () => {
    expect(
      spareFor({ greater_health_potion: configured, health_potion: 56 }),
    ).toBe(56);
  });

  it('gives a boss fight the whole stock, reserve included', () => {
    expect(spareFor({ greater_health_potion: 156 }, true)).toBe(
      MaxEquippedUtilities,
    );
  });
});
