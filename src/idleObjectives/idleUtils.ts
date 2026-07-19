import { getAllNpcItems } from '../api_calls/NPC.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import { Role } from '../types/CharacterData.js';
import { CharacterSchema, ItemSchema } from '../types/types.js';
import { GetCharacterData, getHighestCharLevel, logger } from '../utils.js';
import {
  deleteExpiredWishlistRequests,
  getWishlistRequestsByIds,
  deleteWishlistRequest,
} from '../wishlist/functions.js';
import { FulfillWishlistRequestObjective } from '../wishlist/objective.js';
import { AcquisitionMethod } from '../wishlist/types.js';

/**
 * @description We can't trade with the Tasks Master until the tasks_farmer achievement is complete
 * This function will ensure that we prioritise doing tasks to get it.
 */
export async function completeTasksFarmerAchievement(
  character: Character,
  role: Role,
) {
  if (
    character.completedAchievements.find(
      (achievement) => achievement.code === 'tasks_farmer',
    )
  ) {
    return true;
  } else {
    logger.debug(
      `tasks_farmer achievement not completed. Doing tasks to contribute`,
    );

    if (
      role === 'crafter' ||
      role === 'gearcrafter' ||
      role === 'jewelrycrafter' ||
      role === 'weaponcrafter'
    ) {
      await character.doMonsterTask(2);
    } else {
      await character.doItemsTask(2);
    }
  }
  return true;
}

/**
 * @description Housekeeping run during idle jobs: deletes expired wishlist
 * requests, then resumes or drops the character's parked (onHold) jobs.
 *
 * For each parked job: if every request it's waiting on is fulfilled, its rows
 * are cleaned up and the job is re-enqueued (it restarts and picks up the items
 * now in the bank). If any request has expired or disappeared, the job is
 * retried once, then dropped if it still can't be fulfilled.
 */
export async function checkOnHoldQueue(character: Character): Promise<void> {
  await deleteExpiredWishlistRequests();

  // Snapshot because resume/drop mutate character.onHold
  for (const entry of [...character.onHold]) {
    const requestIds = entry.waitingOn.map((r) => r.requestId);
    const rows = await getWishlistRequestsByIds(requestIds);

    const allFulfilled =
      rows.length === requestIds.length && rows.every((r) => r.fulfilled);

    if (allFulfilled) {
      for (const id of requestIds) {
        logger.info(`Clearing fulfilled request with ID ${id}`);
        await deleteWishlistRequest(id);
      }
      character.clearOnHoldRetried(entry.job.objectiveId);
      await character.resumeOnHoldJob(entry);
      continue;
    }

    // A row is gone (expired and cleaned up, or deleted) — it can't be fulfilled
    const someRequestsGone = rows.length < entry.waitingOn.length;
    if (someRequestsGone) {
      if (!entry.retried) {
        logger.info(
          `On-hold job ${entry.job.objectiveId} has an unfulfillable request; retrying once`,
        );
        character.markOnHoldRetried(entry.job.objectiveId);
        await character.resumeOnHoldJob(entry);
      } else {
        logger.warn(
          `Dropping on-hold job ${entry.job.objectiveId}; requests could not be fulfilled`,
        );
        await character.dropOnHoldJob(entry);
      }
    }
    // Otherwise every request still exists but isn't fulfilled yet — keep waiting
  }
}

export async function checkWithinLevelRange(
  character: Character,
): Promise<boolean> {
  const allCharacterDetails = await GetCharacterData();
  character.highestCharLevel = getHighestCharLevel(allCharacterDetails);

  if (character.data.level < character.highestCharLevel - 10) {
    logger.info(
      `Character level (${character.data.level}) is more than 10 levels behind the leader (${character.highestCharLevel}). Training ${character.highestCharLevel - character.data.level} levels`,
    );
    return await character.trainCombatLevelNow(character.highestCharLevel - 10);
  }

  return true;
}

export async function checkAndBuyArtifacts(
  character: Character,
): Promise<void> {
  if (!character.artifactsMap) {
    logger.warn('checkAndBuyArtifacts: artifactsMap not built, skipping');
    return;
  }

  const charLevel = character.getCharacterLevel(character.data);

  for (const [, artifacts] of Object.entries(character.artifactsMap)) {
    const eligible = (artifacts as ItemSchema[]).filter(
      (a) => a.level <= charLevel,
    );
    if (eligible.length === 0) continue;

    const artifact = eligible.reduce((best, a) =>
      a.level > best.level ? a : best,
    );

    const equipped =
      character.getCharacterGearIn('artifact1') === artifact.code ||
      character.getCharacterGearIn('artifact2') === artifact.code ||
      character.getCharacterGearIn('artifact3') === artifact.code;
    const inInv = character.checkQuantityOfItemInInv(artifact.code);
    const inBank = await character.checkQuantityOfItemInBank(artifact.code);

    if (equipped || inInv + inBank >= 1) continue;

    const npcResult = await getAllNpcItems({ code: artifact.code });
    if (npcResult instanceof ApiError || npcResult.data.length === 0) {
      logger.debug(
        `checkAndBuyArtifacts: no NPC sells ${artifact.code}, skipping`,
      );
      continue;
    }

    const validItems = npcResult.data.filter((item) => item.buy_price != null);
    if (validItems.length === 0) {
      logger.debug(
        `checkAndBuyArtifacts: no valid buy_price for ${artifact.code}, skipping`,
      );
      continue;
    }

    const cheapest = validItems.reduce((a, b) =>
      a.buy_price! < b.buy_price! ? a : b,
    );
    const { buy_price, currency } = cheapest;

    const currencyInInv = character.checkQuantityOfItemInInv(currency);
    const currencyInBank = await character.checkQuantityOfItemInBank(currency);

    if (currencyInInv + currencyInBank < buy_price!) {
      logger.debug(
        `checkAndBuyArtifacts: cannot afford ${artifact.code} (need ${buy_price} ${currency}), skipping`,
      );
      continue;
    }

    const bought = await character.executeJobNow(
      new TradeObjective(character, 'buy', 1, artifact.code),
    );
    if (!bought) {
      logger.warn(
        `checkAndBuyArtifacts: failed to buy ${artifact.code}, continuing`,
      );
      continue;
    }

    const deposited = await character.depositNow(1, artifact.code);
    if (!deposited) {
      logger.warn(
        `checkAndBuyArtifacts: failed to deposit ${artifact.code}, continuing`,
      );
    }
  }
}

/**
 * @description Checks the wishlist for any requests of a certain type
 * Labourers primarily look at mining + woodcutting
 * Crafter looks at weapon/gear/jewelrycrafting
 * Alchemist looks at alchemy
 * Fisherman looks at fishing + cooking
 * @param acquisitionMethod The way to retrieve the requested item
 * @returns true if successful, false if encounter some failure along the way
 */
export async function checkWishlistToFulfill(
  character: Character,
  acquisitionMethod: AcquisitionMethod,
  parentId?: string,
): Promise<boolean> {
  const job = new FulfillWishlistRequestObjective(character, acquisitionMethod);
  return await character.executeJobNow(job, true, true, parentId);
}
