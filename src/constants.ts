import { Role } from './types/CharacterData.js';
import { getEnv } from './getEnv.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

/**
 * My ArtifactsMMO character names
 */
export const BouncyBella = 'BouncyBella';
export const JumpyJimmy = 'JumpyJimmy';
export const LongLegLarry = 'LongLegLarry';
export const TimidTom = 'TimidTom';
export const ZippyZoe = 'ZippyZoe';
export const AllCharNames = [
  LongLegLarry,
  JumpyJimmy,
  ZippyZoe,
  TimidTom,
  BouncyBella,
];

export const CharName = getEnv('CHARACTER_NAME');
export const CharRole = getEnv('ROLE').toLowerCase() as Role;
export const MAX_COMBAT_LEVEL = 50;
export const MAX_SKILL_LEVEL = 50;
export const CRITICAL_MODIFIER = 0.5;

/**
 * Bank stock of task coins to keep.
 */
export const MIN_TASK_COINS_IN_BANK = 50;
/**
 * The minimum coins we want in the bank before we start gambling
 */
export const MIN_TASK_COINS_BEFORE_GAMBLING = 100;

/**
 * How long a monster task is allowed to take before it's worth cancelling for a
 * new one. Every monster task pays the same 3-5 coins whatever the target or the
 * quantity, so the only thing that varies is the time it costs — and that ranges
 * from under an hour to over eight.
 */
export const MAX_MONSTER_TASK_SECONDS = 2.5 * 60 * 60;
/** Each cancel costs a task coin, so don't chase a good draw forever */
export const MAX_TASK_REROLLS = 3;
/**
 * Coins to hold before rerolling a task that is merely slow. A reroll costs one,
 * so this leaves a coin spare to abandon whatever we end up keeping. Kept just
 * above that cost because rerolls are capped at MAX_TASK_REROLLS and a task pays
 * 3-5 coins, so they fund themselves; a higher floor left characters grinding
 * 11h tasks they had already priced as too expensive.
 */
export const MIN_TASK_COINS_TO_REROLL = 2;
/** Fights to simulate when estimating how long a task will take */
export const TASK_ESTIMATE_SIM_ITERATIONS = 10;
/**
 * How many of a task's monsters to fight per round when a monster task has been
 * given a yield check. The check only runs between rounds, so this sets how long
 * work that's ready to run can be left waiting — a few minutes of fighting.
 */
export const FIGHTS_PER_YIELD_CHECK = 25;

/**
 * The max level difference between a character and the highest level character
 */
export const MAX_LEVEL_DISPARITY = 10;

/**
 * Max default number of slots
 */
export const MaxInventorySlots = 20;
/**
 * Maximum number of potions that can be equipped
 */
export const MaxEquippedUtilities = 100;
/**
 * Minimum number of potions to equip
 */
export const MinEquippedUtilities = 20;
/**
 * Desired number of food in inventory
 */
export const DesiredFoodCount = 50;
/**
 *  Minimum food in inventory when going into a fight
 */
export const MinFood = 15;

/**
 * How long a per-item bank quantity stays usable before it's read again.
 * The API budgets data requests per minute across the whole host, so this is
 * really a cap on how often any one item code can cost us a request.
 * https://docs.artifactsmmo.com/api_guide/rate_limits/
 */
export const BankQuantityCacheTtlMs = 30 * 1000;

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');
