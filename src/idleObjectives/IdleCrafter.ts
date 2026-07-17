import {
  actionClaimPendingItems,
  getItemInformation,
  getPendingItems,
} from '../api_calls/Items.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import { Role } from '../types/CharacterData.js';
import { ItemSchema, Skill } from '../types/types.js';
import {
  GetCharacterData,
  getHighestCharLevel,
  isGatheringSkill,
  logger,
} from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
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
import { FulfillWishlistRequestObjective } from '../wishlist/objective.js';

export class IdleCrafterObjective extends Objective {
  role: Role;

  constructor(character: Character, role: Role) {
    super(character, `idle_${role}_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.role = role;
    this.shouldEmitMetrics = true;
    this.metricLabel = role;
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

    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return true;

    await checkWishlistToFulfill('fight');
    if (this.checkIdleJobIsLast()) return true;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return true;

    // If crafter, trian weapon gear and jewelrycrafting
    if (this.role === 'crafter') {
      const combatLevel = this.character.getCharacterLevel(this.character.data);
      const weaponLevel = this.character.getCharacterLevel(
        this.character.data,
        'weaponcrafting',
      );
      const gearLevel = this.character.getCharacterLevel(
        this.character.data,
        'gearcrafting',
      );
      const jewelryLevel = this.character.getCharacterLevel(
        this.character.data,
        'jewelrycrafting',
      );
      if (weaponLevel < combatLevel) {
        await this.trainSkill('weaponcrafting');
        if (this.checkIdleJobIsLast()) return true;
      }
      if (gearLevel < combatLevel) {
        await this.trainSkill('gearcrafting');
        if (this.checkIdleJobIsLast()) return true;
      }
      if (jewelryLevel < combatLevel) {
        await this.trainSkill('jewelrycrafting');
        if (this.checkIdleJobIsLast()) return true;
      }
    } else {
      // Get the relevant skill level based on which role the char is
      let relevantSkillLevel: number;
      let relevantSkillToTrain: Skill;
      switch (this.role) {
        case 'weaponcrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            'weaponcrafting',
          );
          relevantSkillToTrain = 'weaponcrafting';
          break;
        case 'gearcrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            'gearcrafting',
          );
          relevantSkillToTrain = 'gearcrafting';
          break;
        case 'jewelrycrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            'jewelrycrafting',
          );
          relevantSkillToTrain = 'jewelrycrafting';
          break;
      }
      const combatLevel = this.character.getCharacterLevel(this.character.data);

      // Crafting skills should aim to be at the combat level

      if (relevantSkillLevel < combatLevel) {
        await this.trainSkill(relevantSkillToTrain);
        if (this.checkIdleJobIsLast()) return true;
      }

      // We only want to do monster tasks if our crafter skills are at or above our combat level
      if (relevantSkillLevel >= combatLevel) {
        // Only do tasks if the bank is low on task coins.
        const taskCoinsInBank =
          await this.character.checkQuantityOfItemInBank('tasks_coin');

        if (taskCoinsInBank < 10) {
          await this.doMonsterTask(1);
        }
        if (this.checkIdleJobIsLast()) return true;
      }
    }

    // As a last resort, level up combat level
    await this.trainSkill();

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
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doMonsterTask(num?: number): Promise<boolean> {
    return await this.character.executeJobNow(
      new MonsterTaskObjective(this.character, num ?? 1),
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Increase the level of a skill by 1, or combat level if no skill passed in
   * @todo Change this so that it only gets a set amount of an item at a time so that the idle task doesn't take a long time.
   *        I would like to have characters check for events and prioritise events over leveling skills so if we spend ~5 hours
   *        leveling a skill then we might miss some important events
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

    if (!skill) {
      job = new TrainCombatObjective(
        this.character,
        this.character.data.level + 1,
      );
    } else if (isGatheringSkill(skill)) {
      job = new TrainGatheringSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(this.character.data, skill) + 1,
      );
    } else {
      job = new TrainCraftingSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(this.character.data, skill) + 1,
      );
    }
    return await this.character.executeJobNow(
      job,
      true,
      true,
      this.objectiveId,
    );
  }
}
