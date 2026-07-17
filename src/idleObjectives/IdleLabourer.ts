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
import { Character } from '../character/characterClass.js';
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
} from './idleUtils.js';
import { AcquisitionMethod } from '../wishlist/types.js';
import {
  getOpenWishlistRequests,
  markAsExecuting,
  markAsFulfilled,
} from '../wishlist/functions.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';

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

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    await completeTasksFarmerAchievement(this.character, this.role);
    if (this.checkIdleJobIsLast()) return true;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return true;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return true;

    // Improve this to equip wisdom/prospecting gear/artifacts/runes if any
    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(this.character, 'mining', this.objectiveId);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(
      this.character,
      'woodcutting',
      this.objectiveId,
    );
    if (this.checkIdleJobIsLast()) return true;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await this.doItemTask(2);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(this.character, 'mining', this.objectiveId);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(
      this.character,
      'woodcutting',
      this.objectiveId,
    );
    if (this.checkIdleJobIsLast()) return true;

    await this.trainSkill('mining');
    if (this.checkIdleJobIsLast()) return true;

    await this.trainSkill('woodcutting');
    if (this.checkIdleJobIsLast()) return true;
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
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doItemTask(num?: number): Promise<boolean> {
    return await this.character.executeJobNow(
      new ItemTaskObjective(this.character, num ?? 1),
      true,
      true,
      this.objectiveId,
    );
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
  private async trainSkill(skill?: Skill): Promise<boolean> {
    let job: Objective;
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    // Crafting skills should stay relatively close to combat level. Gathering skills can go further above
    const maxLevelGap = [
      'weaponcrafting',
      'gearcrafting',
      'jewelrycrafting',
    ].includes(skill)
      ? 0
      : 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill ? skill : 'combat'} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
      );
      return true;
    } else if (
      skillLevel >=
      this.character.getCharacterLevel(this.character.data) + maxLevelGap
    ) {
      logger.info(
        `${skill} level (${skillLevel}) is too far ahead of combat level (${this.character.getCharacterLevel(this.character.data)}). Not training ${skill}`,
      );
      return true;
    }

    // If the skill is more than 10 levels higher than the characters combat level, we don't want to level it up
    if (
      this.character.getCharacterLevel(this.character.data, skill) >
      this.character.getCharacterLevel(this.character.data) + 10
    ) {
      logger.info(
        `${skill} level (${this.character.getCharacterLevel(this.character.data, skill)}) is more than 10 levels higher than combat level ${this.character.getCharacterLevel(this.character.data)}. Not training`,
      );
      return true;
    }

    if (skill !== 'woodcutting' && skill !== 'mining') {
      logger.debug(
        `Labourers shouldn't be training ${skill}. Should only train mining or woodcutting`,
      );
      return true;
    }

    const resourceTypes: StaticDataPageResourceSchema | ApiError =
      await getAllResourceInformation({
        skill: skill,
        max_level: this.character.getCharacterLevel(this.character.data, skill),
      });
    if (resourceTypes instanceof ApiError) {
      return this.character.handleErrors(resourceTypes);
    }

    let resourceToGather = resourceTypes.data.at(-1).drops[0].code;

    const numToGather = Math.round(
      this.character.data.inventory_max_items * 0.9,
    );
    await this.character.gatherNow(numToGather, resourceToGather, false);
    return await this.character.depositNow(numToGather, resourceToGather);
  }
}
