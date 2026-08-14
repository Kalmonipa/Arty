import { getAllNpcItems } from '../api_calls/NPC.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import { Role } from '../types/CharacterData.js';
import { ItemSchema, ItemSlot, Skill } from '../types/types.js';
import {
  effectValueOf,
  GetCharacterData,
  getHighestCharLevel,
  logger,
} from '../utils.js';
import {
  deleteExpiredWishlistRequests,
  deleteOrphanedWishlistRequests,
  getWishlistRequestsForJob,
  deleteWishlistRequest,
} from '../wishlist/functions.js';
import { AcquisitionMethod } from '../wishlist/types.js';
import { IdentifyValidWishlistRequestsObjective } from '../wishlist/identifyValidWishlistRequests.js';
import { MonsterTaskObjective } from '../core/MonsterTaskObjective.js';
import { ItemTaskObjective } from '../core/ItemTaskObjective.js';
import { Objective } from '../core/Objective.js';
import { ObjectiveCompleted, ObjectiveResult } from '../types/ObjectiveData.js';
import { MAX_LEVEL_DISPARITY } from '../constants.js';

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
 * @description Housekeeping run during idle jobs: clears out wishlist requests
 * nothing can consume any more, then resumes or drops the character's parked
 * (onHold) jobs.
 *
 * A parked job's requests are the wishlist rows recorded against its objectiveId.
 * If they've all been delivered, they're cleaned up and the job is re-enqueued (it
 * restarts and picks up the items now in the bank). If they've all gone — expired
 * and swept, or deleted — nothing will ever deliver them, so the job is retried
 * once and dropped if that doesn't help. Anything in between is still in flight.
 *
 * @returns how many parked jobs were re-enqueued, so a long-running job can tell
 * that work is now waiting on it and stop to let that work run
 */
export async function checkOnHoldQueue(character: Character): Promise<number> {
  let resumed = 0;
  await deleteExpiredWishlistRequests();
  // Runs before the loop reads them, so parked jobs must count as active
  const orphaned = await deleteOrphanedWishlistRequests(
    character.data.name,
    character.activeJobIds(),
  );
  if (orphaned > 0) {
    logger.info(
      `Cleared ${orphaned} wishlist request(s) whose job is no longer queued or parked`,
    );
  }

  // Snapshot because resume/drop mutate character.onHold
  for (const entry of [...character.onHold]) {
    const jobId = entry.job.objectiveId;

    // A train job whose target level the character has since reached (levelled by
    // another route, or by an earlier copy of this job) can never do anything
    // useful, but it holds a slot in the fixed-size onHold queue and makes the
    // idle loop skip that skill as "already being worked on"
    const trainTarget = parseTrainJobId(jobId);
    if (
      trainTarget &&
      character.getCharacterLevel(character.data, trainTarget.skill) >=
        trainTarget.targetLevel
    ) {
      logger.info(
        `Dropping on-hold job ${jobId}; ${trainTarget.skill ?? 'combat'} is already level ${character.getCharacterLevel(character.data, trainTarget.skill)}`,
      );
      await character.dropOnHoldJob(entry);
      continue;
    }

    const rows = await getWishlistRequestsForJob(character.data.name, jobId);

    if (rows.length === 0) {
      if (!entry.retried) {
        logger.info(
          `On-hold job ${jobId} has no request left to wait on; retrying once`,
        );
        character.markOnHoldRetried(jobId);
        await character.resumeOnHoldJob(entry);
        resumed++;
      } else {
        logger.warn(
          `Dropping on-hold job ${jobId}; requests could not be fulfilled`,
        );
        await character.dropOnHoldJob(entry);
      }
      continue;
    }

    if (rows.every((row) => row.fulfilled)) {
      for (const row of rows) {
        logger.info(`Clearing fulfilled request with ID ${row.id}`);
        await deleteWishlistRequest(row.id);
      }
      character.clearOnHoldRetried(jobId);
      await character.resumeOnHoldJob(entry);
      resumed++;
    }
    // Otherwise something is still on its way — keep waiting
  }

  return resumed;
}

/**
 * Each character should be within MAX_LEVEL_DISPARITY levels. If they are more than that
 * number lower, then level up to (MAX_LEVEL_DISPARITY / 2)
 * e.g.: char1 is lvl 27, char2 is level 12. MAX_LEVEL_DISPARITY = 10
 * char2 will notice they are behind and train combat up to level 22 (5 levels below highest)
 * @param character
 * @returns
 */
export async function checkWithinLevelRange(
  character: Character,
): Promise<ObjectiveResult> {
  const allCharacterDetails = await GetCharacterData();
  character.highestCharLevel = getHighestCharLevel(allCharacterDetails);

  if (character.data.level < character.highestCharLevel - MAX_LEVEL_DISPARITY) {
    const targetLevel = character.highestCharLevel - MAX_LEVEL_DISPARITY / 2;
    logger.info(
      `${character.data.name}s level (${character.data.level}) is more than 10 levels behind the highest (${character.highestCharLevel}). Training to level ${targetLevel}`,
    );
    return await character.trainCombatLevelNow(targetLevel);
  }

  return ObjectiveCompleted;
}

const ArtifactSlots: ItemSlot[] = ['artifact1', 'artifact2', 'artifact3'];

/**
 * @description Puts an artifact the character already owns into a free artifact
 * slot, pulling it out of the bank first when it isn't being carried.
 * @returns false when there was no free slot or a step failed, so callers can
 * fall back to banking the item
 */
async function equipOwnedArtifact(
  character: Character,
  code: string,
  heldInInventory: boolean,
): Promise<boolean> {
  const freeSlot = ArtifactSlots.find(
    (slot) => character.getCharacterGearIn(slot) === '',
  );
  if (!freeSlot) {
    logger.debug(`No free artifact slot for ${code}, leaving it in the bank`);
    return false;
  }

  if (!heldInInventory && !(await character.withdrawNow(1, code)).success) {
    logger.warn(`Failed to withdraw ${code} to equip it`);
    return false;
  }

  logger.info(`Equipping ${code} into ${freeSlot}`);
  return (await character.equipNow(code, freeSlot)).success;
}

/**
 * @description Makes sure each effect the character can benefit from is covered
 * by an equipped artifact, buying one when they don't own it yet. Candidates for
 * an effect are tried strongest-first: an artifact's level says nothing about how
 * much of the effect it grants (perfect_pearl gives +100 prospecting and
 * lich_race_trophy +50, both at level 20), and an unaffordable candidate must not
 * hide the ones behind it.
 */
export async function checkAndBuyArtifacts(
  character: Character,
): Promise<void> {
  if (!character.artifactsMap) {
    logger.warn('checkAndBuyArtifacts: artifactsMap not built, skipping');
    return;
  }

  const charLevel = character.getCharacterLevel(character.data);

  for (const [effect, artifacts] of Object.entries(character.artifactsMap)) {
    const candidates = (artifacts as ItemSchema[])
      .filter((a) => a.level <= charLevel)
      .sort(
        (a, b) =>
          effectValueOf(b, effect) - effectValueOf(a, effect) ||
          b.level - a.level,
      );

    for (const artifact of candidates) {
      const equipped = ArtifactSlots.some(
        (slot) => character.getCharacterGearIn(slot) === artifact.code,
      );

      // Already worn, so this effect is covered
      if (equipped) break;

      const inInv = character.checkQuantityOfItemInInv(artifact.code);
      const inBank = await character.checkQuantityOfItemInBank(artifact.code);

      // Owning a copy is no use while it sits in the bank, so equip it rather
      // than treating the effect as covered and moving on
      if (inInv + inBank >= 1) {
        await equipOwnedArtifact(character, artifact.code, inInv >= 1);
        break;
      }

      const npcResult = await getAllNpcItems({ code: artifact.code });
      if (npcResult instanceof ApiError || npcResult.data.length === 0) {
        logger.debug(
          `checkAndBuyArtifacts: no NPC sells ${artifact.code}, trying next`,
        );
        continue;
      }

      const validItems = npcResult.data.filter(
        (item) => item.buy_price != null,
      );
      if (validItems.length === 0) {
        logger.debug(
          `checkAndBuyArtifacts: no valid buy_price for ${artifact.code}, trying next`,
        );
        continue;
      }

      const cheapest = validItems.reduce((a, b) =>
        a.buy_price! < b.buy_price! ? a : b,
      );
      const { buy_price, currency } = cheapest;

      const currencyInInv = character.checkQuantityOfItemInInv(currency);
      const currencyInBank =
        await character.checkQuantityOfItemInBank(currency);

      if (currencyInInv + currencyInBank < buy_price!) {
        logger.debug(
          `checkAndBuyArtifacts: cannot afford ${artifact.code} (need ${buy_price} ${currency}), trying next`,
        );
        continue;
      }

      const bought = await character.executeJobNow(
        new TradeObjective(character, 'buy', 1, artifact.code),
      );
      if (!bought.success) {
        logger.warn(
          `checkAndBuyArtifacts: failed to buy ${artifact.code}, trying next`,
        );
        continue;
      }

      if (!(await equipOwnedArtifact(character, artifact.code, true))) {
        const deposited = await character.depositNow(1, artifact.code);
        if (!deposited.success) {
          logger.warn(
            `checkAndBuyArtifacts: failed to deposit ${artifact.code}, continuing`,
          );
        }
      }
      break;
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
 * @returns the result of the job that identifies and fulfils the requests
 */
export async function checkWishlistToFulfill(
  character: Character,
  acquisitionMethod: AcquisitionMethod,
  parentId?: string,
): Promise<ObjectiveResult> {
  const job = new IdentifyValidWishlistRequestsObjective(
    character,
    acquisitionMethod,
  );
  return await character.executeJobNow(job, true, true, parentId);
}

/**
 * Completes a monster task
 *
 * The idle loops only reach for a monster task when there's nothing better to do,
 * so it gives way as soon as there is something better. A task runs for hours,
 * and the on-hold queue used to be checked only at the top of an idle cycle,
 * which meant a parked crafting job whose materials had already arrived waited
 * for the whole task to finish before it could carry on.
 * @returns the result of the monster task job
 */
export async function doMonsterTask(
  character: Character,
  parentObj?: Objective,
  num?: number,
): Promise<ObjectiveResult> {
  const job = new MonsterTaskObjective(character, num ?? 1);
  job.shouldYieldBetweenFights = async () =>
    (await checkOnHoldQueue(character)) > 0;

  return await character.executeJobNow(job, true, true, parentObj?.objectiveId);
}

/**
 * Completes an item task
 * @returns the result of the item task job
 */
export async function doItemTask(
  character: Character,
  parentObj?: Objective,
  num?: number,
): Promise<ObjectiveResult> {
  return await character.executeJobNow(
    new ItemTaskObjective(character, num ?? 1),
    true,
    true,
    parentObj?.objectiveId,
  );
}

export function shuffle(array: AcquisitionMethod[]): AcquisitionMethod[] {
  const shuffledArray: AcquisitionMethod[] = [...array];
  let currentIndex = shuffledArray.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [shuffledArray[currentIndex], shuffledArray[randomIndex]] = [
      shuffledArray[randomIndex],
      shuffledArray[currentIndex],
    ];
  }

  return shuffledArray;
}

/**
 * Matches the `train_<targetLevel>_<skill>` ids the train objectives build, plus
 * the short random suffix every objective id carries.
 */
const TrainJobId = /^train_(\d+)_([a-z]+)_[a-z0-9]+$/;

/**
 * @description Reads the target level and skill back out of a train job's id.
 * `skill` is undefined for combat, which is what getCharacterLevel expects.
 * @returns undefined when the id isn't a train job
 */
export function parseTrainJobId(
  objectiveId: string,
): { targetLevel: number; skill?: Skill } | undefined {
  const match = TrainJobId.exec(objectiveId);
  if (!match) return undefined;

  return {
    targetLevel: Number(match[1]),
    skill: match[2] === 'combat' ? undefined : (match[2] as Skill),
  };
}

/**
 * @description Orders crafting skill by level, lowest first so when training
 * crafting skills, the crafter can start at the bottom
 */
export function craftingSkillsToTrain(
  skillLevels: { skill: Skill; level: number }[],
  combatLevel: number,
): Skill[] {
  return skillLevels
    .filter(({ level }) => level < combatLevel)
    .sort((a, b) => a.level - b.level)
    .map(({ skill }) => skill);
}
