import { ItemSchema } from '../types/types.js';
import { GearEffects } from '../types/ItemData.js';
import { StatWeights } from './gearPlan.js';

/**
 * @description What this item is worth for the fight the plan describes, in hit
 * points. Effects the plan puts no price on contribute nothing, and a negative
 * effect counts against the item — which is how `dreadful_shield` and its -5
 * res_air stopped being picked for an air fight.
 */
export function scoreGear(item: ItemSchema, weights: StatWeights): number {
  let score = 0;

  for (const effect of item.effects ?? []) {
    const weight = weights[effect.code as GearEffects];
    if (weight !== undefined) {
      score += effect.value * weight;
    }
  }

  return score;
}

/**
 * @description The best of these items for the plan, or nothing when none of
 * them help. Scoring nothing is a real answer: it means every candidate is
 * either useless or a liability, and the slot is better left as it is than
 * filled for the sake of filling it.
 */
export function bestByScore(
  items: ItemSchema[],
  weights: StatWeights,
  charLevel: number,
): ItemSchema | undefined {
  let best: { item: ItemSchema; score: number } | undefined;

  for (const item of items) {
    if (item.level > charLevel) {
      continue;
    }

    const score = scoreGear(item, weights);
    if (score <= 0) {
      continue;
    }

    if (!best || score > best.score) {
      best = { item, score };
    }
  }

  return best?.item;
}
