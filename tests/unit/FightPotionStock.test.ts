import { jest } from '@jest/globals';
import { IdleHealerObjective } from '../../src/idleObjectives/idleHealer.js';
import { Character } from '../../src/character/character.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';
import {
  BossFightPotionReserve,
  FightPotionsToStock,
  MinFightPotionsInBank,
  RestorePotionCraftBatch,
  RestorePotionStockTarget,
} from '../../src/constants.js';

const potion = (code: string, level: number, craftLevel: number): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'utility',
    subtype: 'potion',
    craft: { level: craftLevel, skill: 'alchemy', items: [], quantity: 2 },
  }) as unknown as ItemSchema;

const airBoost = potion('air_boost_potion', 10, 10);
const fireBoost = potion('fire_boost_potion', 10, 10);
const enhancedBoost = potion('enhanced_boost_potion', 40, 40);
const airRes = potion('air_res_potion', 40, 40);
const fireRes = potion('fire_res_potion', 40, 40);

/** enhanced_boost_potion carries all four damage effects, so it sits in every bucket */
const utilitiesMap = {
  boost_dmg_air: [airBoost, enhancedBoost],
  boost_dmg_earth: [enhancedBoost],
  boost_dmg_fire: [fireBoost, enhancedBoost],
  boost_dmg_water: [enhancedBoost],
  boost_res_air: [airRes],
  boost_res_earth: [],
  boost_res_fire: [fireRes],
  boost_res_water: [],
  boost_hp: [],
  restore: [],
  splash_restore: [],
  antipoison: [],
};

type Options = {
  alchemyLevel?: number;
  bank?: Record<string, number>;
  charLevels?: number[];
};

const alchemist = (craftNow: jest.Mock, options: Options = {}) => {
  const { alchemyLevel = 50, bank = {}, charLevels = [44, 39] } = options;

  return {
    data: { name: 'ZippyZoe', level: 37 },
    allCharacterDetails: charLevels.map(
      (level) => ({ level }) as CharacterSchema,
    ),
    getAllBankItems: jest.fn(async () =>
      Object.entries(bank).map(([code, quantity]) => ({ code, quantity })),
    ),
    getCharacterLevel: (_char: CharacterSchema, skill?: string) =>
      skill === 'alchemy' ? alchemyLevel : 37,
    utilitiesMap,
    craftNow,
  } as unknown as Character;
};

const runTopUp = async (character: Character) => {
  const healer = new IdleHealerObjective(character);
  await (
    healer as unknown as {
      topUpFightPotionsInBank: () => Promise<unknown>;
    }
  ).topUpFightPotionsInBank();
};

const craftedCodes = (craftNow: jest.Mock): string[] =>
  craftNow.mock.calls.map(([, code]) => code as string);

describe('stocking the bank with fight potions', () => {
  it('crafts a boost and a resistance potion for each element it can make', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(alchemist(craftNow));

    expect(craftedCodes(craftNow).sort()).toEqual([
      'air_boost_potion',
      'air_res_potion',
      'enhanced_boost_potion',
      'fire_boost_potion',
      'fire_res_potion',
    ]);
  });

  it('crafts a potion that covers every element only once', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(alchemist(craftNow));

    const enhanced = craftedCodes(craftNow).filter(
      (code) => code === 'enhanced_boost_potion',
    );
    expect(enhanced).toHaveLength(1);
  });

  it('tops the stock up to the target rather than crafting a full batch', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(alchemist(craftNow, { bank: { air_boost_potion: 30 } }));

    expect(craftNow).toHaveBeenCalledWith(
      FightPotionsToStock - 30,
      'air_boost_potion',
    );
  });

  it('leaves a stock that is still above the floor alone', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(
      alchemist(craftNow, {
        bank: { air_boost_potion: MinFightPotionsInBank },
      }),
    );

    expect(craftedCodes(craftNow)).not.toContain('air_boost_potion');
  });

  it('skips tiers the alchemist cannot craft yet', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(alchemist(craftNow, { alchemyLevel: 20 }));

    // The level 40 recipes are out of reach, the level 10 boosts are not
    expect(craftedCodes(craftNow).sort()).toEqual([
      'air_boost_potion',
      'fire_boost_potion',
    ]);
  });

  it('skips tiers no character is high enough to drink', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(alchemist(craftNow, { charLevels: [12, 15] }));

    expect(craftedCodes(craftNow).sort()).toEqual([
      'air_boost_potion',
      'fire_boost_potion',
    ]);
  });

  it('crafts nothing off a bank snapshot that failed to load', async () => {
    const craftNow = jest.fn(async () => true);
    const character = alchemist(craftNow);
    (character.getAllBankItems as jest.Mock).mockImplementation(
      async () => undefined,
    );

    await runTopUp(character);

    // A stale snapshot reports 0 of everything, so acting on it would craft a
    // full stock of all eight potions purely because we were rate limited
    expect(craftNow).not.toHaveBeenCalled();
  });
});

describe('building the restore potion stock past the boss reserve', () => {
  const restorePotions = [
    potion('small_health_potion', 5, 5),
    potion('health_potion', 30, 30),
    potion('greater_health_potion', 40, 40),
    potion('enhanced_health_potion', 45, 45),
  ];

  const healerWith = (
    craftNow: jest.Mock,
    bank: Record<string, number>,
    charLevels: number[] = [44, 39],
  ) =>
    ({
      data: { name: 'ZippyZoe', level: 37 },
      allCharacterDetails: charLevels.map(
        (level) => ({ level }) as CharacterSchema,
      ),
      getAllBankItems: jest.fn(async () =>
        Object.entries(bank).map(([code, quantity]) => ({ code, quantity })),
      ),
      getCharacterLevel: (_char: CharacterSchema, skill?: string) =>
        skill === 'alchemy' ? 50 : 37,
      utilitiesMap: { ...utilitiesMap, restore: restorePotions },
      craftNow,
    }) as unknown as Character;

  const runTopUp = async (character: Character) => {
    const healer = new IdleHealerObjective(character);
    await (
      healer as unknown as {
        topUpRestorePotionsInBank: () => Promise<unknown>;
      }
    ).topUpRestorePotionsInBank();
  };

  it('brews a batch at a time while the stock is short of the target', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(healerWith(craftNow, { health_potion: 40 }));

    expect(craftNow).toHaveBeenCalledWith(
      RestorePotionCraftBatch,
      expect.any(String),
    );
  });

  it('counts every tier toward the target, not just the best one', async () => {
    const craftNow = jest.fn(async () => true);

    // 200 + 310 clears the target between them, though neither would alone
    await runTopUp(
      healerWith(craftNow, {
        health_potion: 200,
        greater_health_potion: 310,
      }),
    );

    expect(craftNow).not.toHaveBeenCalled();
  });

  it('stops once the stock covers the reserve and a working supply', async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(
      healerWith(craftNow, { greater_health_potion: RestorePotionStockTarget }),
    );

    expect(craftNow).not.toHaveBeenCalled();
  });

  it('keeps brewing at the reserve, which an ordinary fight cannot see', async () => {
    const craftNow = jest.fn(async () => true);

    // Exactly the reserve: every potion banked is spoken for, so the fighters
    // are dry until the alchemist gets past it
    await runTopUp(
      healerWith(craftNow, {
        greater_health_potion: BossFightPotionReserve.restore,
      }),
    );

    expect(craftNow).toHaveBeenCalled();
  });

  it('brews a tier no character is sitting on, so a run-out has a fallback', async () => {
    const craftNow = jest.fn(async () => true);

    // Nobody is level 40-44, so greater_health_potion has no character whose
    // best tier it is, but the level 45 fighter still falls back to it
    await runTopUp(healerWith(craftNow, {}, [45, 39]));

    expect(craftedCodes(craftNow)).toContain('greater_health_potion');
  });

  it("leaves out tiers below the weakest character's best", async () => {
    const craftNow = jest.fn(async () => true);

    await runTopUp(healerWith(craftNow, {}, [45, 39]));

    // The level 39 character already reaches health_potion, so the level 5
    // tier is wasted mats for everyone
    expect(craftedCodes(craftNow)).not.toContain('small_health_potion');
  });

  it('brews nothing off a bank snapshot that failed to load', async () => {
    const craftNow = jest.fn(async () => true);
    const character = healerWith(craftNow, {});
    (character.getAllBankItems as jest.Mock).mockImplementation(
      async () => undefined,
    );

    await runTopUp(character);

    expect(craftNow).not.toHaveBeenCalled();
  });
});
