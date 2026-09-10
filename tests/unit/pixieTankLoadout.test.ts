import { ItemSchema, MonsterSchema } from '../../src/types/types.js';
import { resolveGearPlan } from '../../src/evaluateGear/gearPlan.js';
import { bestByScore } from '../../src/evaluateGear/gearScore.js';
import {
  BossFightHealer,
  BossFightTank,
} from '../../src/fightBosses/bossFight.types.js';

function item(
  code: string,
  level: number,
  effects: Record<string, number>,
): ItemSchema {
  return {
    code,
    name: code,
    level,
    subtype: '',
    description: '',
    conditions: [],
    effects: Object.entries(effects).map(([effectCode, value]) => ({
      code: effectCode,
      value,
      description: '',
    })),
    tradeable: true,
  } as unknown as ItemSchema;
}

/** Pixie as the API reports it */
const pixie = {
  name: 'Pixie',
  code: 'pixie',
  level: 40,
  type: 'raid_boss',
  hp: 1200000,
  attack_fire: 0,
  attack_earth: 0,
  attack_water: 0,
  attack_air: 675,
  res_fire: 10,
  res_earth: 5,
  res_water: 10,
  res_air: 5,
  critical_strike: 5,
  initiative: 800,
  effects: [
    { code: 'lifesteal', value: 20, description: '' },
    { code: 'enchanted_mirror', value: 50, description: '' },
  ],
  min_gold: 0,
  max_gold: 0,
  drops: [],
} as unknown as MonsterSchema;

/** Real stats for the pieces the fleet can actually field */
const catalogue = {
  shield: [
    item('dreadful_shield', 35, { res_air: -5, res_earth: 15 }),
    item('gold_shield', 30, { res_air: 10, res_earth: 10 }),
    item('mithril_shield', 40, { res_air: 15, res_fire: 15 }),
  ],
  body_armor: [
    item('strangold_armor', 35, { hp: 150, threat: 5, dmg_water: 22 }),
    item('malefic_armor', 35, { hp: 170, threat: 3 }),
    item('mithril_platebody', 40, { hp: 200, threat: 4 }),
    item('snakeskin_armor', 25, { hp: 150, res_air: 10, initiative: 50 }),
  ],
  leg_armor: [
    item('strangold_legs_armor', 35, { hp: 150, res_air: 7 }),
    item('ancient_jean', 35, { hp: 150, threat: 4 }),
    item('mithril_platelegs', 40, { hp: 250, res_air: 7, threat: 5 }),
  ],
  boots: [
    item('old_boots', 20, { hp: 90 }),
    item('gold_boots', 30, { hp: 110, res_air: 8 }),
  ],
  ring: [
    item('topaz_ring', 30, { dmg: 17, dmg_earth: 7, critical_strike: 3 }),
    item('malefic_ring', 35, { dmg: 14, critical_strike: 7 }),
    item('royal_skeleton_ring', 30, {
      hp: 70,
      threat: 5,
      dmg: 12,
      prospecting: 30,
      initiative: 80,
    }),
  ],
};

describe('the pixie tank loadout the simulator scored at 100%', () => {
  const tankPlan = resolveGearPlan({
    monster: pixie,
    role: BossFightTank,
    partySize: 3,
  });
  const threatVariant = tankPlan.variants.find(
    (variant) => variant.name === 'threat',
  );

  const pick = (slot: keyof typeof catalogue, charLevel = 46) =>
    bestByScore(catalogue[slot], threatVariant!.weights, charLevel)?.code;

  it('rejects the shield whose air resistance is negative', () => {
    expect(pick('shield')).toBe('mithril_shield');
  });

  it('prefers air resistance on the body over a threat stat it does not need', () => {
    expect(pick('body_armor')).toBe('snakeskin_armor');
  });

  it('takes the legs that carry resistance, hp and threat at once', () => {
    expect(pick('leg_armor')).toBe('mithril_platelegs');
  });

  it('takes the boots with air resistance', () => {
    expect(pick('boots')).toBe('gold_boots');
  });

  it('takes the threat ring over the damage rings', () => {
    expect(pick('ring')).toBe('royal_skeleton_ring');
  });

  it('still gives the healer a damage ring rather than leaving the slot empty', () => {
    const healerPlan = resolveGearPlan({
      monster: pixie,
      role: BossFightHealer,
      partySize: 3,
    });

    const chosen = bestByScore(
      catalogue.ring,
      healerPlan.variants[0].weights,
      41,
    );

    // Pixie resists earth least, so the earth ring is the one worth wearing
    expect(chosen?.code).toBe('topaz_ring');
  });

  it('leaves the threat ring to the tank and gives the healer nothing for it', () => {
    const healerPlan = resolveGearPlan({
      monster: pixie,
      role: BossFightHealer,
      partySize: 3,
    });

    const chosen = bestByScore(
      catalogue.ring,
      healerPlan.variants[0].weights,
      41,
    );

    expect(chosen?.code).not.toBe('royal_skeleton_ring');
  });
});
