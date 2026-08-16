import { scoreWeaponAgainstResistances } from '../../src/utils.js';
import { ItemSchema } from '../../src/types/types.js';
import { MonsterResistance } from '../../src/types/MonsterData.js';

const weapon = (
  code: string,
  attacks: Partial<Record<string, number>>,
): ItemSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'weapon',
    subtype: '',
    description: '',
    craft: null,
    tradeable: true,
    conditions: [],
    effects: Object.entries(attacks).map(([effectCode, value]) => ({
      code: effectCode,
      value,
      description: '',
    })),
  }) as ItemSchema;

/** The lich: joint-lowest resistance on air and water, highest on earth and fire */
const lichResistances: MonsterResistance[] = [
  {
    type: 'res_air',
    atkCounterType: 'attack_air',
    dmgCounterType: 'dmg_air',
    value: 18,
  },
  {
    type: 'res_earth',
    atkCounterType: 'attack_earth',
    dmgCounterType: 'dmg_earth',
    value: 24,
  },
  {
    type: 'res_fire',
    atkCounterType: 'attack_fire',
    dmgCounterType: 'dmg_fire',
    value: 24,
  },
  {
    type: 'res_water',
    atkCounterType: 'attack_water',
    dmgCounterType: 'dmg_water',
    value: 18,
  },
];

describe('scoreWeaponAgainstResistances', () => {
  it('discounts each attack element by the resistance that counters it', () => {
    const score = scoreWeaponAgainstResistances(
      weapon('gold_sword', { attack_earth: 60, attack_air: 20 }),
      lichResistances,
    );

    // 60 earth at 24% resisted, plus 20 air at 18% resisted
    expect(score).toBeCloseTo(60 * 0.76 + 20 * 0.82);
  });

  it('ignores effects that are not attacks', () => {
    const score = scoreWeaponAgainstResistances(
      weapon('gold_sword', { attack_earth: 60, critical_strike: 5 }),
      lichResistances,
    );

    expect(score).toBeCloseTo(60 * 0.76);
  });

  it('scores a weapon with no attack effects as zero', () => {
    const score = scoreWeaponAgainstResistances(
      weapon('wooden_stick', { critical_strike: 5 }),
      lichResistances,
    );

    expect(score).toBe(0);
  });

  it('ranks a big hit into a resisted element above a token hit into a weak one', () => {
    // The heuristic this replaces picked by least-resisted element alone, which
    // ranked these the other way round
    const battleaxe = scoreWeaponAgainstResistances(
      weapon('dreadful_battleaxe', { attack_water: 65, attack_earth: 20 }),
      lichResistances,
    );
    const bow = scoreWeaponAgainstResistances(
      weapon('magic_bow', { attack_air: 47, attack_water: 14 }),
      lichResistances,
    );

    expect(battleaxe).toBeGreaterThan(bow);
  });
});
