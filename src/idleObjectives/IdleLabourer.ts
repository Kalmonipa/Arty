import {
  actionClaimPendingItems,
  getAllItemInformation,
  getItemInformation,
  getPendingItems,
} from '../api_calls/Items.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import { Role } from '../types/CharacterData.js';
import {
  ItemSchema,
  Skill,
  StaticDataPageResourceSchema,
} from '../types/types.js';
import {
  GetCharacterData,
  getHighestCharLevel,
  isGatheringSkill,
  logger,
} from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { ItemTaskObjective } from '../core/ItemTaskObjective.js';
import { MonsterTaskObjective } from '../core/MonsterTaskObjective.js';
import { Objective } from '../core/Objective.js';
import { TrainCombatObjective } from '../core/TrainCombatObjective.js';
import { TrainCraftingSkillObjective } from '../core/TrainCraftingSkillObjective.js';
import { TrainGatheringSkillObjective } from '../core/TrainGatheringSkillObjective.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
  doMonsterTask,
  doItemTask,
  shuffle,
} from './idleUtils.js';
import { AcquisitionMethod } from '../wishlist/types.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { Gearcrafting, Jewelrycrafting, Weaponcrafting } from '../names.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

/**
 * Labourer role idle jobs
 * Primary focus is mining and woodcutting
 *
 * @todo Check the wishlist for any mining, wooductting requests
 * and fulfill them
 */
export class IdleLabourerObjective extends Objective {
  role: Role;

  constructor(character: Character) {
    super(character, `idle_labourer_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'labourer';
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<ObjectiveResult> {
    let startTime = Date.now();

    await completeTasksFarmerAchievement(this.character, this.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // Improve this to equip wisdom/prospecting gear/artifacts/runes if any
    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // Woodcutting wishlist requests aren't getting done so I figured shuffling
    // the order in which the labourers fulfill the requests should help that
    const wishlistTypes: AcquisitionMethod[] = ['mining', 'woodcutting'];
    const shufflesWishlistRequests = shuffle(wishlistTypes);

    await checkWishlistToFulfill(
      this.character,
      shufflesWishlistRequests[0],
      this.objectiveId,
    );
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(
      this.character,
      shufflesWishlistRequests[1],
      this.objectiveId,
    );
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    if (Date.now() - startTime > 10 * 60 * 1000) {
      logger.info(
        `Idle job has been running for more than 10 minutes. Ending it to let the next idle job run`,
      );
      return ObjectiveCompleted;
    } else if (
      this.character.getCharacterLevel(this.character.data) <
      this.character.highestCharLevel - 5
    ) {
      logger.info(
        `Combat level is more than 5 levels below highest character level. Doing monster task to train combat`,
      );
      await doMonsterTask(this.character, this, 1);
    } else {
      logger.info(
        `Combat level is within 5 levels of highest character level. Doing item task`,
      );
      await doItemTask(this.character, this, 1);
      if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
    }
    return ObjectiveCompleted;
  }

  /**
   * @description Helper function to check if there are any new jobs added to the queue
   * @returns true if there are other jobs in the queue, false if not
   */
  private checkIdleJobIsLast() {
    const jobs = this.character.jobList ?? [];
    const idleJobIndex = jobs.findIndex((job: Objective) =>
      job.objectiveId.startsWith('idle_'),
    );
    if (idleJobIndex === -1) {
      return false;
    }
    if (idleJobIndex !== jobs.length - 1) {
      return true;
    }
    return false;
  }

  /**
   * Checks for pending items and claims any that need claiming
   */
  private async claimPendingItems(): Promise<boolean> {
    const pendingItems = await getPendingItems();

    if (pendingItems instanceof ApiError) {
      return this.character.handleErrors(pendingItems);
    }

    const unclaimed = pendingItems.data.filter((item) => !item.claimed_at);

    if (unclaimed.length === 0) {
      logger.info(`No pending items to claim`);
      return true;
    }

    for (const pendingItem of unclaimed) {
      logger.info(
        `Claiming item ${pendingItem.description} from ${pendingItem.source}`,
      );
      const claimResponse = await actionClaimPendingItems(
        this.character.data,
        pendingItem.id,
      );
      if (claimResponse instanceof ApiError) {
        await this.character.handleErrors(claimResponse);
      }
    }
    return true;
  }

  /**
   * Gather an inventory full of the highest level material to level up that skill
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill?: Skill): Promise<ObjectiveResult> {
    let job: Objective;
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    // Crafting skills should stay relatively close to combat level. Gathering skills can go further above
    const maxLevelGap = [
      Weaponcrafting,
      Gearcrafting,
      Jewelrycrafting,
    ].includes(skill)
      ? 0
      : 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill ? skill : 'combat'} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
      );
      return ObjectiveCompleted;
    } else if (
      skillLevel >=
      this.character.getCharacterLevel(this.character.data) + maxLevelGap
    ) {
      logger.info(
        `${skill} level (${skillLevel}) is too far ahead of combat level (${this.character.getCharacterLevel(this.character.data)}). Not training ${skill}`,
      );
      return ObjectiveCancelled;
    }

    // If the skill is more than 10 levels higher than the characters combat level, we don't want to level it up
    if (
      this.character.getCharacterLevel(this.character.data, skill) >
      this.character.getCharacterLevel(this.character.data) + 10
    ) {
      logger.info(
        `${skill} level (${this.character.getCharacterLevel(this.character.data, skill)}) is more than 10 levels higher than combat level ${this.character.getCharacterLevel(this.character.data)}. Not training`,
      );
      return ObjectiveCancelled;
    }

    if (skill !== 'woodcutting' && skill !== 'mining') {
      logger.debug(
        `Labourers shouldn't be training ${skill}. Should only train mining or woodcutting`,
      );
      return ObjectiveCancelled;
    }

    const resourceTypes: StaticDataPageResourceSchema | ApiError =
      await getAllResourceInformation({
        skill: skill,
        max_level: this.character.getCharacterLevel(this.character.data, skill),
      });
    if (resourceTypes instanceof ApiError) {
      await this.character.handleErrors(resourceTypes);
      return ObjectiveFailed;
    }

    let resourceToGather = resourceTypes.data.at(-1).drops[0].code;

    const numToGather = Math.round(
      this.character.data.inventory_max_items * 0.9,
    );
    await this.character.gatherNow(numToGather, resourceToGather, false);
    return await this.character.depositNow(numToGather, resourceToGather);
  }
}
