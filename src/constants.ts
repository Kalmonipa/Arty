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
export const MIN_TASK_COINS_IN_BANK = 25;

/**
 * How long a monster task is allowed to take before it's worth cancelling for a
 * new one. Every monster task pays the same 3-5 coins whatever the target or the
 * quantity, so the only thing that varies is the time it costs — and that ranges
 * from under an hour to over eight.
 */
export const MAX_MONSTER_TASK_SECONDS = 2.5 * 60 * 60;
/** Each cancel costs a task coin, so don't chase a good draw forever */
export const MAX_TASK_REROLLS = 3;
/** Leave enough coins that rerolling can't strand us without any */
export const MIN_TASK_COINS_TO_REROLL = 10;
/** Fights to simulate when estimating how long a task will take */
export const TASK_ESTIMATE_SIM_ITERATIONS = 10;

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
