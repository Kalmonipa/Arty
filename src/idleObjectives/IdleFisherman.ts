import {
  actionClaimPendingItems,
  getPendingItems,
} from '../api_calls/Items.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import {
  GatheringSkill,
  StaticDataPageResourceSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
} from './idleUtils.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

export class IdleFishermanObjective extends Objective {
  constructor(character: Character) {
    super(character, `idle_fisherman_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'fisherman';
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

    await completeTasksFarmerAchievement(this.character, 'fisherman');
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(this.character, 'fishing', this.objectiveId);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(this.character, 'cooking', this.objectiveId);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(this.character, 'tasks', this.objectiveId);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // If the skill gets 5 levels ahead of their combat level then they won't train the skill any further
    // There's no need for skills to get too far ahead of combat level
    await this.trainSkill('fishing');
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    if (Date.now() - startTime > 10 * 60 * 1000) {
      logger.info(
        `Idle job has been running for more than 10 minutes. Ending it to see if there's something we need to do`,
      );
      return ObjectiveCompleted;
    } else {
      // If the idle job hasn't really triggered any other jobs, we want to top up some fish
      await this.gatherExtraFish();
    }

    return ObjectiveCompleted;
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
   * Gathers an inventory full of the food suitable for the lowest level character
   * This function is used as a last resort for the fisherman
   * @returns
   */
  private async gatherExtraFish() {
    logger.info(`Gathering extra fish to top up the bank`);
    for (const fish of this.character.consumablesMap['heal'].filter(
      (consumable) =>
        consumable.craft?.skill === 'cooking' &&
        consumable.craft.items.some((ingredient) =>
          this.character.fishingDropCodes.has(ingredient.code),
        ),
    )) {
      logger.info(`Checking if ${fish.code} is a candidate`);
      if (
        fish.craft.level <
          this.character.getCharacterLevel(this.character.data, 'fishing') &&
        fish.craft.level <= this.character.highestCharLevel &&
        // e.g. Char lvl is 29, we should cook lvl 20 fish so they can use it
        fish.craft.level >= this.character.lowestCharLevel - 9
      ) {
        const numToCraft = Math.round(
          this.character.data.inventory_max_items * 0.95,
        );
        logger.info(`Crafting ${numToCraft}x ${fish.name}`);
        // Gather an inventory full of the lowest level fish needed
        await this.character.craftNow(numToCraft, fish.code);
      }
    }
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
   */
  private async topUpBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minimumFoodInBank = 1000;

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
   * Increase the level of a skill by 1, or combat level if no skill passed in
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill?: GatheringSkill): Promise<ObjectiveResult> {
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    const maxLevelGap = 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill || 'combat'} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
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
