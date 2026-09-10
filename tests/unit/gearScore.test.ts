import { ItemSchema } from '../../src/types/types.js';
import { StatWeights } from '../../src/evaluateGear/gearPlan.js';
import { bestByScore, scoreGear } from '../../src/evaluateGear/gearScore.js';

function gear(
  code: string,
  level: number,
  effects: Record<string, number>,
): ItemSchema {
  return {
    code,
    name: code,
    level,
    type: 'shield',
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

describe('scoreGear', () => {
  it('sums each effect against its weight', () => {
    const weights: StatWeights = { hp: 1, res_air: 168.75 };
    const item = gear('mithril_shield', 40, { res_air: 15, res_fire: 15 });

    // res_fire is unweighted against an air-only monster, so it adds nothing
    expect(scoreGear(item, weights)).toBeCloseTo(15 * 168.75);
  });

  it('counts a negative resistance against the item', () => {
    const weights: StatWeights = { hp: 1, res_air: 168.75 };
    const dreadful = gear('dreadful_shield', 35, { res_air: -5 });

    expect(scoreGear(dreadful, weights)).toBeLessThan(0);
  });

  it('ignores effects the plan puts no price on', () => {
    const weights: StatWeights = { hp: 1 };
    const item = gear('prospecting_hat', 30, { prospecting: 60, hp: 10 });

    expect(scoreGear(item, weights)).toBe(10);
  });
});

describe('bestByScore', () => {
  const weights: StatWeights = { hp: 1, res_air: 168.75 };

  it('picks the highest scoring item', () => {
    const best = bestByScore(
      [
        gear('dreadful_shield', 35, { res_air: -5 }),
        gear('gold_shield', 30, { res_air: 10 }),
        gear('mithril_shield', 40, { res_air: 15 }),
      ],
      weights,
      46,
    );

    expect(best?.code).toBe('mithril_shield');
  });

  it('skips items above the character level', () => {
    const best = bestByScore(
      [
        gear('gold_shield', 30, { res_air: 10 }),
        gear('air_shield', 45, { res_air: 25 }),
      ],
      weights,
      41,
    );

    expect(best?.code).toBe('gold_shield');
  });

  it('returns nothing when no item scores above zero', () => {
    const best = bestByScore(
      [gear('dreadful_shield', 35, { res_air: -5 })],
      weights,
      46,
    );

    expect(best).toBeUndefined();
  });
});
