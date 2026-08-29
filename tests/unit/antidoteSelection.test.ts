import { jest } from '@jest/globals';
import { FightObjective } from '../../src/fights/fight.objective.js';
import { Character } from '../../src/character/character.js';
import { usableUtilityTiers } from '../../src/utils.js';
import { ItemSchema, MonsterSchema } from '../../src/types/types.js';

const potion = (code: string, level: number, value: number): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'utility',
    subtype: 'potion',
    effects: [{ code: 'antipoison', value }],
  }) as unknown as ItemSchema;

// The real catalogue: nothing counters sand_snake's 100 poison outright, and the
// only tier that beats it is one the bank has never held
const antidotes = [
  potion('small_antidote', 20, 20),
  potion('antidote', 30, 50),
  potion('enhanced_antidote', 45, 200),
];

const restorePotions = [
  potion('small_health_potion', 5, 30),
  potion('health_potion', 30, 100),
];

describe('working out which utility tiers are worth simulating', () => {
  const stock = (held: Record<string, number>) => (code: string) =>
    held[code] ?? 0;

  it('offers the tiers in stock, weakest first', () => {
    const tiers = usableUtilityTiers(
      antidotes,
      45,
      stock({ small_antidote: 1400, enhanced_antidote: 5 }),
    );

    expect(tiers.map((tier) => tier.item.code)).toEqual([
      'small_antidote',
      'enhanced_antidote',
    ]);
  });

  it('leaves out a tier nothing is held of', () => {
    const tiers = usableUtilityTiers(antidotes, 45, stock({ antidote: 20 }));

    expect(tiers.map((tier) => tier.item.code)).toEqual(['antidote']);
  });

  it('leaves out a tier the character is too low to equip', () => {
    const tiers = usableUtilityTiers(
      antidotes,
      40,
      stock({ antidote: 20, enhanced_antidote: 5 }),
    );

    expect(tiers.map((tier) => tier.item.code)).toEqual(['antidote']);
  });

  it('reports how many are actually available, capped at a full slot', () => {
    const tiers = usableUtilityTiers(
      antidotes,
      45,
      stock({ small_antidote: 1400, antidote: 7 }),
    );

    // A sim run at a full stack of 100 would be answering a question about
    // potions the character hasn't got
    expect(tiers.map((tier) => tier.available)).toEqual([100, 7]);
  });
});

describe('preparing for a fight against a poisonous mob', () => {
  const sandSnake = {
    code: 'sand_snake',
    name: 'Sand Snake',
    level: 44,
    effects: [{ code: 'poison', value: 100 }],
  } as unknown as MonsterSchema;

  type Loadout = { utility1_slot?: string; utility2_slot?: string };

  /**
   * @param winsWith the utility2 codes that carry the fight; every other
   * loadout, the unaided run included, loses badly enough to rule out fighting
   * dry
   */
  const fighter = (
    bank: Record<string, number>,
    winsWith: string[],
    charLevel = 45,
  ) => {
    // decideOnHealthPotions mutates one schema across every sim, so each
    // loadout has to be copied as it is used or they all read as the last one
    const simulated: Loadout[] = [];
    const simulateFightNow = jest.fn(async (schemas: Loadout[]) => {
      simulated.push({ ...schemas[0] });
      const wins = winsWith.includes(schemas[0].utility2_slot ?? '');
      return { success: wins, winRate: wins ? 100 : 5 };
    });
    const equipAntiEffectUtility = jest.fn(async () => ({
      complete: true,
      success: true,
      reason: 'complete',
    }));

    const character = {
      data: {
        name: 'LongLegLarry',
        level: charLevel,
        utility1_slot: 'health_potion',
        utility1_slot_quantity: 40,
        utility2_slot_quantity: 0,
      },
      createFakeCharacterSchema: () => ({}),
      simulateFightNow:
        simulateFightNow as unknown as Character['simulateFightNow'],
      getCharacterLevel: () => charLevel,
      checkQuantityOfItemInInv: () => 0,
      unequipNow: jest.fn(async () => ({
        complete: true,
        success: true,
        reason: 'complete',
      })),
      depositNow: jest.fn(async () => ({
        complete: true,
        success: true,
        reason: 'complete',
      })),
      getAllBankItems: jest.fn(async () =>
        Object.entries(bank).map(([code, quantity]) => ({ code, quantity })),
      ),
      utilitiesMap: { antipoison: antidotes, restore: restorePotions },
      equipAntiEffectUtility,
      equipUtility: jest.fn(async () => ({
        complete: true,
        success: true,
        reason: 'complete',
      })),
    } as unknown as Character;

    return { character, simulated, equipAntiEffectUtility };
  };

  const prepare = async (character: Character) => {
    const fight = new FightObjective(character, {
      code: 'sand_snake',
      quantity: 25,
    });
    return await (
      fight as unknown as {
        decideOnHealthPotions: (mob: MonsterSchema) => Promise<unknown>;
      }
    ).decideOnHealthPotions(sandSnake);
  };

  /**
   * Which antidote each simulation was run with, in order. The later restore
   * potion sim reuses the same schema, so it is told apart by utility1
   */
  const simulatedAntidotes = (simulated: Loadout[]): string[] =>
    simulated
      .filter((schema) => schema.utility2_slot && !schema.utility1_slot)
      .map((schema) => schema.utility2_slot);

  it('wins with a tier that does not fully counter the poison', async () => {
    // 1400 small_antidote is all the bank has, and it counters 20 of 100
    const { character, equipAntiEffectUtility } = fighter(
      { small_antidote: 1400 },
      ['small_antidote'],
    );

    await prepare(character);

    expect(equipAntiEffectUtility).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'small_antidote' }),
      'utility2',
    );
  });

  it('stops at the weakest tier that wins', async () => {
    const { character, simulated, equipAntiEffectUtility } = fighter(
      { small_antidote: 1400, antidote: 20, enhanced_antidote: 5 },
      ['antidote'],
    );

    await prepare(character);

    expect(simulatedAntidotes(simulated)).toEqual([
      'small_antidote',
      'antidote',
    ]);
    expect(equipAntiEffectUtility).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'antidote' }),
      'utility2',
    );
  });

  it('never simulates a tier the bank has none of', async () => {
    const { character, simulated } = fighter({ antidote: 20 }, []);

    await prepare(character);

    expect(simulatedAntidotes(simulated)).toEqual(['antidote']);
  });

  it('carries the strongest tier it holds when none wins on its own', async () => {
    const { character, equipAntiEffectUtility } = fighter(
      { small_antidote: 1400, antidote: 20 },
      [],
    );

    await prepare(character);

    expect(equipAntiEffectUtility).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'antidote' }),
      'utility2',
    );
  });

  it('prepares without one when the bank holds no antidote at all', async () => {
    const { character, equipAntiEffectUtility } = fighter({}, []);

    await expect(prepare(character)).resolves.toBeDefined();
    expect(equipAntiEffectUtility).not.toHaveBeenCalled();
  });
});
