import { Character } from '../character/characterClass.js';
import { Role } from '../types/CharacterData.js';
import { GetCharacterData, getHighestCharLevel, logger } from '../utils.js';
import {
  deleteExpiredWishlistRequests,
  getWishlistRequestsByIds,
  deleteWishlistRequest,
} from '../wishlist/functions.js';

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
 * The aim of this function is to keep all characters within 10 level of the highest level char
 * This lets us recycle older gear so that it doesn't clog up the bank
 */
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
    const rows = await getWishlistRequestsByIds(entry.waitingOn);

    const allFulfilled =
      rows.length === entry.waitingOn.length && rows.every((r) => r.fulfilled);

    if (allFulfilled) {
      for (const id of entry.waitingOn) {
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
