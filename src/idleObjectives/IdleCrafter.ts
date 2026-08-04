import {
  actionClaimPendingItems,
  getAllItemInformation,
  getItemInformation,
  getPendingItems,
} from '../api_calls/Items.js';
import { MAX_SKILL_LEVEL, MIN_TASK_COINS_IN_BANK } from '../constants.js';
import {
  Gearcrafting,
  Jewelrycrafting,
  TasksCoin,
  Weaponcrafting,
} from '../names.js';
import { Role } from '../types/CharacterData.js';
import {
  CraftSkill,
  GetAllItemsItemsGetParams,
  ItemSchema,
  Skill,
} from '../types/types.js';
import { isGatheringSkill, logger, sleep } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { TrainCombatObjective } from '../core/TrainCombatObjective.js';
import { TrainCraftingSkillObjective } from '../core/TrainCraftingSkillObjective.js';
import { TrainGatheringSkillObjective } from '../core/TrainGatheringSkillObjective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
  doMonsterTask,
} from './idleUtils.js';
import { actionTasksExchange } from '../api_calls/Tasks.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

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

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<ObjectiveResult> {
    let startTime = Date.now();

    // ToDo: Maybe we don't need this if we enable gambling
    await completeTasksFarmerAchievement(this.character, this.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.gambleExcessTaskCoins();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(this.character, 'fight', this.objectiveId);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.craftMissingTools();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // Commenting this out because I don't think it's necessary. Characters should request
    // things via the wishlist if they need gear for a fight
    //await this.craftMissingWeapons();
    //if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // If crafter, train weapon gear and jewelrycrafting
    if (this.role === 'crafter') {
      const combatLevel = this.character.getCharacterLevel(this.character.data);
      const weaponLevel = this.character.getCharacterLevel(
        this.character.data,
        Weaponcrafting,
      );
      const gearLevel = this.character.getCharacterLevel(
        this.character.data,
        Gearcrafting,
      );
      const jewelryLevel = this.character.getCharacterLevel(
        this.character.data,
        Jewelrycrafting,
      );
      if (weaponLevel < combatLevel) {
        if (!this.checkForJobInOnHoldQueue(Weaponcrafting)) {
          await this.trainSkill(Weaponcrafting);
        }
        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }
      if (gearLevel < combatLevel) {
        if (!this.checkForJobInOnHoldQueue(Gearcrafting)) {
          await this.trainSkill(Gearcrafting);
        }
        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }
      if (jewelryLevel < combatLevel) {
        if (!this.checkForJobInOnHoldQueue(Jewelrycrafting)) {
          await this.trainSkill(Jewelrycrafting);
        }
        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }
    } else {
      // Get the relevant skill level based on which role the char is
      let relevantSkillLevel: number;
      let relevantSkillToTrain: Skill;
      switch (this.role) {
        case 'weaponcrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            Weaponcrafting,
          );
          relevantSkillToTrain = Weaponcrafting;
          break;
        case 'gearcrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            Gearcrafting,
          );
          relevantSkillToTrain = Gearcrafting;
          break;
        case 'jewelrycrafter':
          relevantSkillLevel = this.character.getCharacterLevel(
            this.character.data,
            Jewelrycrafting,
          );
          relevantSkillToTrain = Jewelrycrafting;
          break;
      }
      const combatLevel = this.character.getCharacterLevel(this.character.data);

      // Crafting skills should aim to be at the combat level

      if (relevantSkillLevel < combatLevel) {
        await this.trainSkill(relevantSkillToTrain);
        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }

      // We only want to do monster tasks if our crafter skills are at or above our combat level
      if (relevantSkillLevel >= combatLevel) {
        if (await this.isLowOnTaskCoins()) {
          await doMonsterTask(this.character, this, 1);
        }
        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }
    }

    if (Date.now() - startTime > 10 * 60 * 1000) {
      logger.info(
        `Idle job has been running for more than 10 minutes. Ending it to let the next idle job run`,
      );
      return ObjectiveCompleted;
    } else if (await this.isLowOnTaskCoins()) {
      // If the idle job hasn't really triggered any other jobs, we want to do a monster task
      await doMonsterTask(this.character, this, 1);
    } else {
      const minutesToSleep = 4;
      logger.info(
        `Nothing to do for ${this.character.data.name}. Sleeping for ${minutesToSleep} minutes`,
      );
      await sleep(minutesToSleep * 60, 'crafter_idle', false);
    }

    return ObjectiveCompleted;
  }

  /**
   * @description Task coins are only worth farming while the bank is short of
   * them; past that, a monster task is hours of fighting for a currency we
   * already have plenty of.
   */
  private async isLowOnTaskCoins(): Promise<boolean> {
    const taskCoinsInBank =
      await this.character.checkQuantityOfItemInBank(TasksCoin);

    if (taskCoinsInBank >= MIN_TASK_COINS_IN_BANK) {
      logger.debug(
        `${taskCoinsInBank} ${TasksCoin} in the bank (target ${MIN_TASK_COINS_IN_BANK}). Not doing a monster task`,
      );
      return false;
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
   * If we have excess (>maxCoinsInBank) task coins in the bank, gamble the excess to get rewards
   * @returns True if successful
   */
  private async gambleExcessTaskCoins(): Promise<boolean> {
    // The number of task coins needed to exchange. Pretty sure this won't change but who knows
    const costToExchange = 6;
    // Arbitrary number for now. Might adjust as I see fit
    const maxCoinsInBank = MIN_TASK_COINS_IN_BANK + costToExchange;
    const coinsInBank =
      await this.character.checkQuantityOfItemInBank(TasksCoin);

    if (coinsInBank < maxCoinsInBank) {
      logger.info(
        `${coinsInBank}/${maxCoinsInBank} task coins in bank. Not gambling any`,
      );
      return true;
    }

    const numExchangesToMake = Math.floor(
      (coinsInBank - MIN_TASK_COINS_IN_BANK) / costToExchange,
    );
    const coinsToSpend = numExchangesToMake * costToExchange;

    await this.character.withdrawNow(coinsToSpend, TasksCoin);

    const taskMasterLocations = await this.character.getAvailableTaskMasters();
    const nearestMap = this.character.evaluateClosestMap(taskMasterLocations);

    await this.character.move(nearestMap);

    for (let iteration = 0; iteration < numExchangesToMake; iteration++) {
      const exchangeResult = await actionTasksExchange(this.character.data);
      if (exchangeResult instanceof ApiError) {
        logger.error(exchangeResult.error.message);
        logger.error(
          `Failed to exchange coins at map ${nearestMap.map_id} (x: ${nearestMap.x}, y: ${nearestMap.y})`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Ensures that there are the latest available tools in the bank. Any missing ones get crafted
   * @returns true if successful
   */
  private async craftMissingTools(): Promise<ObjectiveResult> {
    // Character level minus this is the minimum level of tools to craft
    const levelRange = 9;
    const skill = Weaponcrafting;

    const charLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );

    // Get bank items so we don't need to make lots of bank calls
    const allBankItems = await this.character.getAllBankItems();

    logger.debug(
      `Finding missing tools between ${Math.max(charLevel - levelRange, 0)} and ${charLevel}`,
    );

    const payload: GetAllItemsItemsGetParams = {
      craft_skill: skill,
      max_level: charLevel,
      min_level: Math.max(charLevel - levelRange, 0),
    };

    const craftableItemsListData = await getAllItemInformation(payload);
    if (craftableItemsListData instanceof ApiError) {
      await this.character.handleErrors(craftableItemsListData);
      return ObjectiveFailed;
    }

    const craftableItemsList = craftableItemsListData.data;
    if (craftableItemsList.length === 0) {
      logger.error(`No craftable items found. This shouldn't happen?`);
      return ObjectiveFailed;
    }

    for (const craftableItem of craftableItemsList) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      if (craftableItem.subtype !== 'tool') {
        logger.debug(
          `[train_${skill}] Skipping ${craftableItem.code} because it's not a tool`,
        );
        continue;
      }
      logger.debug(`Checking ${craftableItem.code} count in bank`);
      const bankItem = allBankItems.find(
        (bankItem) => craftableItem.code === bankItem.code,
      );

      // Ensure there is at least 1 of each tool in the bank. We might have crafted more
      // but if they're in use then we'd like to have spares in case someone else needs one
      if (!bankItem || bankItem.quantity < 1) {
        if (await this.needsBossDrop(craftableItem)) {
          logger.warn(
            `Skipping ${craftableItem.code} because it needs a boss drop`,
          );
          continue;
        }

        logger.debug(
          `Crafting ${craftableItem.code} because there aren't enough in bank`,
        );
        if (
          await this.character.craftNow(
            1,
            craftableItem.code,
            undefined,
            undefined,
            true,
          )
        ) {
          // Only deposit if the craft was successful
          return await this.character.depositNow(1, craftableItem.code);
        }
      }
    }
  }

  /**
   * Crafts 1 of each weapon that is missing from the bank
   * @returns
   */
  private async craftMissingWeapons(): Promise<ObjectiveResult> {
    const levelRange = 9;
    const skill = Weaponcrafting;
    const allBankItems = await this.character.getAllBankItems();

    const charLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );

    const payload: GetAllItemsItemsGetParams = {
      craft_skill: Weaponcrafting,
      max_level: charLevel,
      min_level: Math.max(charLevel - levelRange, 0),
    };

    const craftableItemsListData = await getAllItemInformation(payload);
    if (craftableItemsListData instanceof ApiError) {
      await this.character.handleErrors(craftableItemsListData);
      return ObjectiveFailed;
    }

    const craftableItemsList = craftableItemsListData.data;
    if (craftableItemsList.length === 0) {
      logger.error(`No craftable items found. This shouldn't happen?`);
      return ObjectiveFailed;
    }

    for (const craftableItem of craftableItemsList) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      if (craftableItem.subtype === 'tool') {
        logger.debug(
          `[train_${skill}] Skipping ${craftableItem.code} because it is a tool`,
        );
        continue;
      }

      logger.debug(`Checking ${craftableItem.code} count in bank`);
      const bankItem = allBankItems.find(
        (bankItem) => craftableItem.code === bankItem.code,
      );

      if (!bankItem || bankItem.quantity < 1) {
        if (await this.needsBossDrop(craftableItem)) {
          logger.warn(
            `Skipping ${craftableItem.code} because it needs a boss drop`,
          );
          continue;
        }

        logger.debug(
          `Crafting ${craftableItem.code} because there aren't enough in bank`,
        );
        if (
          await this.character.craftNow(
            1,
            craftableItem.code,
            undefined,
            undefined,
            true,
          )
        ) {
          // Only deposit if the craft was successful
          return await this.character.depositNow(1, craftableItem.code);
        }
      }
    }
  }

  /**
   * Returns true if any ingredient of the item is dropped by a boss monster,
   * meaning the item can't be reliably crafted while training.
   */
  private async needsBossDrop(item: ItemSchema): Promise<boolean> {
    if (!item.craft?.items) return false;

    for (const ingredient of item.craft.items) {
      const ingredientInfo = await getItemInformation(ingredient.code);
      if (ingredientInfo instanceof ApiError) {
        logger.warn(`Item info not found for ${ingredient.code}`);
        continue;
      }
      if (ingredientInfo.subtype !== 'mob') continue;

      const mobsThatDrop = await getAllMonsterInformation({
        drop: ingredientInfo.code,
      });
      if (mobsThatDrop instanceof ApiError) {
        logger.warn(`Mob info not found for drop ${ingredientInfo.code}`);
        continue;
      }

      if (mobsThatDrop.data.some((mob) => mob.type === 'boss')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Increase the level of a skill by 1, or combat level if no skill passed in
   * @todo Change this so that it only gets a set amount of an item at a time so that the idle task doesn't take a long time.
   *        I would like to have characters check for events and prioritise events over leveling skills so if we spend ~5 hours
   *        leveling a skill then we might miss some important events
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
