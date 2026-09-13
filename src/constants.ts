import { UtilityEffects } from './types/ItemData.js';

import { Role } from './types/CharacterData.js';
import { getEnv } from './getEnv.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

/**
 * This file should contain constants from my implementation
 * Game data constants are in src/gameDataConstants.ts
 */

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
export const MaxCombatLevel = 50;
export const MaxSkillLevel = 50;
export const CriticalModifier = 0.5;

/**
 * Roles
 */
export const Alchemist = 'alchemist';
export const Crafter = 'crafter';
export const Healer = 'healer';
export const Fisherman = 'fisherman';
export const Gearcrafter = 'gearcrafter';
export const Jewelrycrafter = 'jewelrycrafter';
export const Labourer = 'labourer';
export const Lumberjack = 'lumberjack';
export const Miner = 'miner';
export const Weaponcrafter = 'weaponcrafter';

/**
 * Bank stock of task coins to keep. Rerolls and task cancels are paid in coins,
 * so this reserve is what stops gambling from leaving a task unabandonable.
 */
export const MinTaskCoinsInBank = 50;
/**
 * Maximum task coins we'd like in the bank
 */
export const MaxCoinsNeeded = 200;

/**
 * How long a monster task is allowed to take before it's worth cancelling for a
 * new one.
 */
export const MaxMonsterTaskSeconds = 3 * 60 * 60;
/** Each cancel costs a task coin, so don't chase a good draw forever */
export const MaxTaskRerolls = 3;
/**
 * Coins to hold before rerolling a task that is merely slow. A reroll costs one,
 * so this leaves a coin spare to abandon whatever we end up keeping. Kept just
 * above that cost because rerolls are capped at MaxTaskRerolls and a task pays
 * 3-5 coins, so they fund themselves; a higher floor left characters grinding
 * 11h tasks they had already priced as too expensive.
 */
export const MinTaskCoinsToReroll = 2;
/** Fights to simulate when estimating how long a task will take */
export const TaskEstimateSimIterations = 10;
/**
 * How many of a task's monsters to fight per round when a monster task has been
 * given a yield check. The check only runs between rounds, so this sets how long
 * work that's ready to run can be left waiting — a few minutes of fighting.
 */
export const FightsPerYieldCheck = 25;

/**
 * The max level difference between a character and the highest level character
 */
export const MaxLevelDisparity = 10;

/**
 * Max default number of slots
 */
export const MaxInventorySlots = 20;
/**
 * Maximum number of potions that can be equipped
 */
/**
 * @description The hard cap on a fight. A raid fight is won by reaching it, an
 * ordinary one is lost by reaching it.
 */
export const MaxFightTurns = 100;

export const MaxEquippedUtilities = 100;
/**
 * Minimum number of potions to equip
 */
export const MinEquippedUtilities = 20;

/**
 * @description Potions held back in the bank for boss fights and raids, by
 * effect. 300 restores is enough for three characters to fight a boss.
 *
 * This is a hard floor: ordinary fights see only what is banked above it, and
 * see nothing at all once stock is down to it. A raid window is a few minutes
 * long and the party cannot break off to brew, so the stock has to already be
 * there when it opens. The cost is that a fleet whose stock has fallen to the
 * floor fights unaided until the alchemist gets back above it.
 */
export const BossFightPotionReserve: Partial<Record<UtilityEffects, number>> = {
  restore: 300,
};

/**
 * @description The unaided win rate a character will settle for rather than
 * spend restore potions.
 */
export const PotionlessFightWinRateFloor = 60;

/**
 * @description How many losses in a row a deliberately unaided fight tolerates
 * before giving up
 */
export const PotionlessFightMaxConsecutiveLosses = 6;

/**
 * @description How many restore potions the alchemist works toward across every
 * tier: the boss fight reserve plus a working supply for ordinary fights.
 */
export const RestorePotionWorkingStock = 200;
export const RestorePotionStockTarget =
  (BossFightPotionReserve.restore ?? 0) + RestorePotionWorkingStock;

/** How many of one tier the alchemist brews in a single pass */
export const RestorePotionCraftBatch = 100;

/**
 * @description How many damage boost and resistance potions of each kind the
 * alchemist keeps in the bank, and the level it lets the stock fall to before
 * crafting more. A fighter equips up to a full stack per boss fight, so the
 * stock is per potion rather than across all of them.
 */
export const FightPotionsToStock = 100;
export const MinFightPotionsInBank = 50;

/**
 * @description How many splash restore potions the alchemist works toward.
 *
 * Stocked far deeper than a boost because splash restore is what wins a raid:
 * both healers carry a full stack, and the party gets three or four fights in a
 * window, so a boost-sized 100 would not cover one fight. Nothing but a boss
 * fight ever draws on these, so the deep stock never competes with the fleet's
 * ordinary fighting.
 */
export const SplashPotionsToStock = 600;

/**
 * @description How many splash potions the alchemist brews in one pass, so
 * filling an empty bank is spread over several idle cycles instead of one job
 * that gathers for hours.
 */
export const SplashPotionCraftBatch = 100;
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

/**
 * Movement and transition cooldowns, per the game docs:
 * https://docs.artifactsmmo.com/concepts/maps_and_movement/#move
 */
export const MoveSecondsPerTile = 5;
export const TransitionSeconds = 5;
/** Cooldown for drinking a potion */
export const UseItemSeconds = 3;

/**
 * How much travel time a teleport potion has to save before it is worth
 * drinking. A potion is not free: someone has to gather its ingredients and brew
 * it, so shaving a few tiles off a walk costs the fleet more time than it
 * returns. Only savings beyond this are real.
 */
export const TeleportMinimumSavingSeconds = 60;

/**
 * How long a character waits before trying to expand a full bank again. The
 * gold for an expansion has to be earned, so a bank that was full a moment ago
 * still is; anything shorter just spends API budget confirming it.
 */
export const BankFullRetryMs = 10 * 60 * 1000;

/**
 * How many times a deposit is attempted before the character gives up and
 * carries its inventory away. Only errors handleErrors calls retryable get
 * this far, and even those are worth only a few goes: the retry is immediate,
 * so a loop here spends the whole fleet's action budget within the minute.
 */
export const DepositRetryLimit = 3;

/** How often the crafter looks for an open raid window */
export const RaidCheckIntervalSeconds = 300;

/** The role that leads raids. It tanks, and calls the rest of the party up */
export const RaidLeaderRoleName = 'crafter';

/**
 * How many of each teleport potion a character carries
 */
export const TeleportPotionStock = 1;

/**
 * How many times move() re-plans a route after drawing its requirements from the bank.
 * The trip to the bank relocates the character, so the first re-plan is expected; a
 * second covers the re-planned route introducing a gate the first one didn't have.
 */
export const MaxRouteReplans = 2;

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server

/**
 * @description The release this build came from, baked in by the image build
 * from the git tag. Falls back to 'dev' when running from source, so a log line
 * always says something rather than 'undefined'.
 */
export const AppVersion = process.env.APP_VERSION || 'dev';
export const ApiToken = getEnv('API_TOKEN');
