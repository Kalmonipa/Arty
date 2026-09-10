import { MonsterSchema } from '../../src/types/types.js';
import {
  resolveFightProfile,
  resolveGearPlan,
} from '../../src/evaluateGear/gearPlan.js';
import {
  BossFightDps,
  BossFightHealer,
  BossFightRole,
  BossFightTank,
} from '../../src/fightBosses/bossFight.types.js';

function monster(overrides: Partial<MonsterSchema> = {}): MonsterSchema {
  return {
    name: 'Test Mob',
    code: 'test_mob',
    level: 40,
    type: 'normal',
    hp: 5000,
    attack_fire: 0,
    attack_earth: 0,
    attack_water: 0,
    attack_air: 100,
    res_fire: 0,
    res_earth: 0,
    res_water: 0,
    res_air: 0,
    critical_strike: 5,
    initiative: 100,
    effects: [],
    min_gold: 0,
    max_gold: 0,
    drops: [],
    ...overrides,
  } as MonsterSchema;
}

describe('resolveFightProfile', () => {
  it('treats a raid boss as a survival fight', () => {
    expect(resolveFightProfile(monster({ type: 'raid_boss' }))).toBe(
      'survival',
    );
  });

  it.each([['reconstitution'], ['barrier'], ['sun_shield'], ['healing']])(
    'treats a boss with %s as a dps race',
    (effect) => {
      const mob = monster({
        type: 'boss',
        effects: [{ code: effect, value: 50, description: '' }],
      } as Partial<MonsterSchema>);

      expect(resolveFightProfile(mob)).toBe('dps_race');
    },
  );

  it('falls back to balanced for an ordinary monster', () => {
    expect(resolveFightProfile(monster())).toBe('balanced');
  });

  it('lets an override win over what the monster data implies', () => {
    const mob = monster({
      code: 'chatty_boss',
      type: 'boss',
      effects: [{ code: 'healing', value: 10, description: '' }],
    } as Partial<MonsterSchema>);

    expect(resolveFightProfile(mob)).toBe('dps_race');
    expect(resolveFightProfile(mob, { chatty_boss: 'balanced' })).toBe(
      'balanced',
    );
  });
});

const pixie = () =>
  monster({
    code: 'pixie',
    type: 'raid_boss',
    hp: 1200000,
    attack_air: 675,
    res_air: 5,
    res_earth: 5,
    res_fire: 10,
    res_water: 10,
    effects: [
      { code: 'lifesteal', value: 20, description: '' },
      { code: 'enchanted_mirror', value: 50, description: '' },
    ],
  } as Partial<MonsterSchema>);

describe('resolveGearPlan weights', () => {
  it('prices a point of resistance in the damage it actually prevents', () => {
    const plan = resolveGearPlan({
      monster: pixie(),
      role: BossFightTank,
      partySize: 3,
    });

    // A 3-character party plus the boss take turns, so the boss lands 25 of the
    // 100 turns. One point of res_air is 1% off each of those 675 hits.
    expect(plan.weights.res_air).toBeCloseTo(675 * 0.01 * 25);
  });

  it('measures every weight in hit points, so hp itself is worth 1', () => {
    const plan = resolveGearPlan({
      monster: pixie(),
      role: BossFightTank,
      partySize: 3,
    });

    expect(plan.weights.hp).toBe(1);
  });

  it('gives no credit for resisting an element the monster never uses', () => {
    const plan = resolveGearPlan({
      monster: pixie(),
      role: BossFightTank,
      partySize: 3,
    });

    expect(plan.weights.res_fire ?? 0).toBe(0);
    expect(plan.weights.res_earth ?? 0).toBe(0);
    expect(plan.weights.res_water ?? 0).toBe(0);
  });
});

describe('resolveGearPlan variants', () => {
  const plan = (role: BossFightRole) =>
    resolveGearPlan({ monster: pixie(), role, partySize: 3 });

  it('offers the tank a variant that pays for threat', () => {
    const variants = plan(BossFightTank).variants;

    expect(variants.some((variant) => (variant.weights.threat ?? 0) > 0)).toBe(
      true,
    );
  });

  it('never pays a healer for threat, which would steal the boss off the tank', () => {
    for (const variant of plan(BossFightHealer).variants) {
      expect(variant.weights.threat ?? 0).toBeLessThanOrEqual(0);
    }
  });

  it('offers more than one variant for the tank so the sim can choose', () => {
    expect(plan(BossFightTank).variants.length).toBeGreaterThan(1);
  });
});

describe('resolveGearPlan damage pricing', () => {
  it('treats damage as a tie-breaker when the fight is won by lasting', () => {
    const plan = resolveGearPlan({
      monster: pixie(),
      role: BossFightHealer,
      partySize: 3,
    });

    expect(plan.weights.dmg).toBeCloseTo(plan.weights.res_air! / 100);
  });

  it('prices damage like resistance when the boss undoes damage', () => {
    const reconstituting = monster({
      code: 'lich',
      type: 'boss',
      attack_fire: 500,
      res_air: 0,
      res_fire: 40,
      effects: [{ code: 'reconstitution', value: 50, description: '' }],
    } as Partial<MonsterSchema>);

    const plan = resolveGearPlan({
      monster: reconstituting,
      role: BossFightTank,
      partySize: 3,
    });

    expect(plan.profile).toBe('dps_race');
    expect(plan.weights.dmg).toBeCloseTo(plan.weights.res_fire!);
  });

  it('makes damage a liability for the tank a mirroring boss can reach', () => {
    const tank = resolveGearPlan({
      monster: pixie(),
      role: BossFightTank,
      partySize: 3,
    });
    const healer = resolveGearPlan({
      monster: pixie(),
      role: BossFightHealer,
      partySize: 3,
    });

    expect(tank.weights.dmg).toBeLessThan(0);
    expect(healer.weights.dmg).toBeGreaterThan(0);
  });
});

describe('resolveGearPlan role pricing', () => {
  const ordinaryBoss = () =>
    monster({
      code: 'bandit_lizard',
      type: 'boss',
      attack_earth: 300,
      attack_air: 0,
      res_earth: 30,
      res_water: 0,
    } as Partial<MonsterSchema>);

  it('prices damage like resistance for the dps, whose job it is', () => {
    const plan = resolveGearPlan({
      monster: ordinaryBoss(),
      role: BossFightDps,
      partySize: 3,
    });

    expect(plan.profile).toBe('balanced');
    expect(plan.weights.dmg).toBeCloseTo(plan.weights.res_earth!);
  });

  it('keeps damage a tie-breaker for the healer in the same fight', () => {
    const plan = resolveGearPlan({
      monster: ordinaryBoss(),
      role: BossFightHealer,
      partySize: 3,
    });

    expect(plan.weights.dmg).toBeCloseTo(plan.weights.res_earth! / 100);
  });
});
