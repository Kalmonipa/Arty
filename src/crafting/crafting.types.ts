import type { Character } from '../character/character.js';
import type { BankCache } from '../bank/bank.cache.js';

/**
 * Per-pass memo of item code -> expected actions for one unit. Scoring a whole
 * candidate list revisits the same bars and ores repeatedly, and each mob drop
 * costs a fight simulation, so this is what keeps a pass affordable.
 */
export type CraftCostMemo = Map<string, number>;

/**
 * Quantities this candidate's costing has already claimed off the bank. Kept
 * separate from the snapshot so scoring never mutates the caller's copy, and so
 * one banked stack can't be counted against two parts of the same recipe.
 */
export type Ledger = Map<string, number>;

export type CostContext = {
  bank: BankCache;
  character: Character;
  memo: CraftCostMemo;
  ledger: Ledger;
  /** Recipes part-way through costing, so a cyclic recipe can't recurse forever. */
  inProgress: Set<string>;
};
