import {
  actionClaimPendingItems,
  getItemInformation,
  getPendingItems,
} from '../api_calls/Items.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import {
  GatheringSkill,
  ItemSchema,
  StaticDataPageResourceSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
import { ItemTaskObjective } from '../core/ItemTaskObjective.js';
import { Objective } from '../core/Objective.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
} from './idleUtils.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { AcquisitionMethod } from '../wishlist/types.js';
import {
  getOpenWishlistRequests,
  markAsExecuting,
  markAsFulfilled,
} from '../wishlist/functions.js';

export class IdleFishermanObjective extends Objective {
  constructor(character: Character) {
    super(character, `idle_fisherman_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'fisherman';
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    await completeTasksFarmerAchievement(this.character, 'fisherman');
    if (this.checkIdleJobIsLast()) return true;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return true;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return true;

    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(this.character, 'fishing', this.objectiveId);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(this.character, 'cooking', this.objectiveId);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill(this.character, 'tasks', this.objectiveId);
    if (this.checkIdleJobIsLast()) return true;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return true;

    // Fisherman has an additional check: food must be sufficiently stocked first.
    const taskCoinsInBank =
      await this.character.checkQuantityOfItemInBank('tasks_coin');

    if (taskCoinsInBank < 35) {
      await this.doItemTask(1);
      if (this.checkIdleJobIsLast()) return true;
    }

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return true;

    // If the skill gets 5 levels ahead of their combat level then they won't train the skill any further
    // There's no need for skills to get too far ahead of combat level
    await this.trainSkill('fishing');
    if (this.checkIdleJobIsLast()) return true;
  }

  /**
   * @description Checks whether each applicable fish type is sufficiently stocked in the bank.
   * Uses the same fish list and level filters as topUpBank so the definition of "applicable"
   * is consistent. Returns true if every applicable type has >= 500 in the bank.
   */
  private async isFishSufficientlyStocked(): Promise<boolean> {
    const minimumFoodInBank = 500;

    for (const fish of this.character.consumablesMap['heal'].filter(
      (consumable) =>
        consumable.craft?.skill === 'cooking' &&
        consumable.craft.items.some((ingredient) =>
          this.character.fishingDropCodes.has(ingredient.code),
        ),
    )) {
      if (
        fish.craft.level <
          this.character.getCharacterLevel(this.character.data, 'fishing') &&
        fish.craft.level <= this.character.highestCharLevel &&
        fish.craft.level >= this.character.lowestCharLevel - 9
      ) {
        const numInBank = await this.character.checkQuantityOfItemInBank(
          fish.code,
        );
        if (numInBank < minimumFoodInBank) {
          return false;
        }
      }
    }
    return true;
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
   * Ensure that we have a minimum amount of certain items in the bank
   * - 500 Food of varying levels
   */
  private async topUpBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minimumFoodInBank = 500;

    for (const fish of this.character.consumablesMap['heal'].filter(
      (consumable) =>
        consumable.craft?.skill === 'cooking' &&
        consumable.craft.items.some((ingredient) =>
          this.character.fishingDropCodes.has(ingredient.code),
        ),
    )) {
      if (
        fish.craft.level <
          this.character.getCharacterLevel(this.character.data, 'fishing') &&
        fish.craft.level <= this.character.highestCharLevel &&
        // e.g. Char lvl is 29, we should cook lvl 20 fish so they can use it
        fish.craft.level >= this.character.lowestCharLevel - 9
      ) {
        // If we can cook the fish, get the number in the bank
        const numInBank = await this.character.checkQuantityOfItemInBank(
          fish.code,
        );
        // Ensure quantity is greater than the required amount
        if (numInBank < minimumFoodInBank) {
          await this.character.craftNow(
            minimumFoodInBank - numInBank,
            fish.code,
          );
        }
      }
    }

    return true;
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
   * Increase the level of a skill by 1, or combat level if no skill passed in
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill?: GatheringSkill): Promise<boolean> {
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    const maxLevelGap = 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill || 'combat'} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
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
