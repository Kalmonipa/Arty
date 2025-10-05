import {
  actionWithdrawGold,
  getBankDetails,
  getBankItems,
  purchaseBankExpansion,
} from '../api_calls/Bank.js';
import { getAllItemInformation } from '../api_calls/Items.js';
import { Role } from '../types/CharacterData.js';
import { ItemSchema, Skill } from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { ItemTaskObjective } from './ItemTaskObjective.js';
import { MonsterTaskObjective } from './MonsterTaskObjective.js';
import { Objective } from './Objective.js';
import { TidyBankObjective } from './TidyBankObjective.js';
import { TrainCombatObjective } from './TrainCombatObjective.js';
import { TrainCraftingSkillObjective } from './TrainCraftingSkillObjective.js';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjective.js';

export class IdleObjective extends Objective {
  role: Role;

  constructor(character: Character, role: Role) {
    super(character, `idle_objective_${role}`, 'not_started');

    this.character = character;
    this.role = role;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Picks a random idle task from the list
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    const idleObjectives = [
      'checkBankExpansion',
      'cleanUpBank',
      'depositGoldIntoBank',
      'topUpBank',
      'doTask',
      'trainSkill',
    ];

    const randomObjective =
      idleObjectives[Math.floor(Math.random() * idleObjectives.length)];

    switch (randomObjective) {
      case 'checkBankExpansion':
        return await this.checkBankExpansion();

      case 'cleanUpBank':
        return await this.cleanUpBank();

      case 'depositGoldIntoBank':
        return await this.depositGoldIntoBank();

      case 'topUpBank':
        return await this.topUpBank(this.role);

      case 'doTask':
        if (this.role === 'fighter' || this.role === 'gearcrafter') {
          return await this.doMonsterTask();
        } else {
          return await this.doItemTask();
        }

      case 'trainSkill':
        switch (this.role) {
          case 'alchemist':
            return await this.trainSkill('alchemy');

          case 'fighter':
            // We want our weaponcrafting to be at least our character level (if not above??)
            if (
              this.character.getCharacterLevel('weaponcrafting') <
              this.character.getCharacterLevel()
            ) {
              return await this.trainSkill('weaponcrafting');
            } else {
              return await this.trainSkill();
            }
          case 'fisherman':
            return await this.trainSkill('fishing');

          case 'gearcrafter':
            // We want our gearcrafter to be able to craft gear for our fighter so ideally we'd craft stuff above our level
            // ToDo: This might run into issues with gathering mob drops if the gearcrafter isn't high enough to fight them
            if (
              this.character.getCharacterLevel('gearcrafting') <
              this.character.getCharacterLevel() + 5
            ) {
              return await this.trainSkill('gearcrafting');
            } else {
              return await this.trainSkill();
            }

          case 'jewelrycrafter':
            return await this.trainSkill('jewelrycrafting');

          case 'lumberjack':
            return await this.trainSkill('woodcutting');

          case 'miner':
            return await this.trainSkill('mining');

          case 'weaponcrafter':
            return await this.trainSkill('weaponcrafting');
        }
    }
  }

  /**
   * Craft certain items and recycle items depending on role
   * @returns true if successful, false if not
   */
  private async cleanUpBank(): Promise<boolean> {
    const job = new TidyBankObjective(this.character, this.role);
    return this.character.executeJobNow(job, true, true, this.objectiveId);
  }

  /**
   * @description Deposits gold into the bank if they have more than 1k
   * @returns
   */
  private async depositGoldIntoBank(): Promise<boolean> {
    const numGoldInInv = this.character.data.gold;

    if (numGoldInInv > 1000) {
      return await this.character.depositNow(numGoldInInv - 1000, 'gold');
    }

    return true;
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   * - 1k Health potions of varying levels
   * - 1k Food of varying levels
   * - x Task coins (maybe?)
   */
  private async topUpBank(role: Role): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minimumInBank = 100;
    const listOfFish = [
      'cooked_gudgeon',
      'cooked_shrimp',
      'cooked_trout',
      'cooked_bass',
      'cooked_salmon',
    ];

    if (role === 'alchemist') {
      for (const potion of this.character.utilitiesMap['restore']) {
        // Check if we can craft the potion
        if (potion.craft.level < this.character.getCharacterLevel('alchemy')) {
          // If we can craft the potion, get the number in the bank
          const numInBank = await this.character.checkQuantityOfItemInBank(
            potion.code,
          );
          // Ensure quantity is greater than 1k
          if (numInBank < minimumInBank) {
            await this.character.craftNow(
              minimumInBank - numInBank,
              potion.code,
            );
          }
        }
      }
    } else if (role === 'fisherman') {
      for (const fish of this.character.consumablesMap['heal'].filter(
        (consumable) => listOfFish.includes(consumable.code),
      )) {
        if (fish.craft.level < this.character.getCharacterLevel('fishing')) {
          // If we can cook the fish, get the number in the bank
          const numInBank = await this.character.checkQuantityOfItemInBank(
            fish.code,
          );
          // Ensure quantity is greater than 1k
          if (numInBank < minimumInBank) {
            await this.character.craftNow(minimumInBank - numInBank, fish.code);
          }
        }
      }
    } else if (role === 'miner') {
      await this.topUpMiningBars()
    }

    return true;
  }

  /**
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doItemTask(): Promise<boolean> {
    return this.character.executeJobNow(
      new ItemTaskObjective(this.character, 1),
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doMonsterTask(): Promise<boolean> {
    return this.character.executeJobNow(
      new MonsterTaskObjective(this.character, 1),
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Purchase a bank expansion if the bank is >90% full and we have at least 25k gold leftover after
   * @todo Implement retry logic based on return values from the handleErrors() functions
   */
  private async checkBankExpansion(): Promise<boolean> {
    const maxBankFullness = 90;
    const targetLeftoverCash = 25000;

    const currentBankFullness = await getBankItems();
    if (currentBankFullness instanceof ApiError) {
      await this.character.handleErrors(currentBankFullness);
      return false;
    }

    const bankDetails = await getBankDetails();
    if (bankDetails instanceof ApiError) {
      await this.character.handleErrors(bankDetails);
      return false;
    }

    // Check if the bank is >90% full
    if (
      Math.floor(bankDetails.data.slots / currentBankFullness.total) * 100 <
      maxBankFullness
    ) {
      logger.debug(`Bank is less than 90% full so no need to upgrade`);
      // Returning true because technically the job completed
      return true;
    }

    // Check if we have enough gold to purchase
    if (
      bankDetails.data.gold <
      bankDetails.data.next_expansion_cost + targetLeftoverCash
    ) {
      logger.debug(
        `Purchasing an upgrade wouldn't leave us with ${targetLeftoverCash}. Not purchasing`,
      );
      return true;
    }

    const withdrawGold = await actionWithdrawGold(this.character.data, bankDetails.data.next_expansion_cost)
    if (withdrawGold instanceof ApiError) {
      await this.character.handleErrors(withdrawGold)
      return false;
    }

    const upgradeBank = await purchaseBankExpansion(this.character.data);
    if (upgradeBank instanceof ApiError) {
      await this.character.handleErrors(upgradeBank);
      return false;
    }

    return true;
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

    if (!skill) {
      job = new TrainCombatObjective(
        this.character,
        this.character.data.level + 1,
      );
    } else if (isGatheringSkill(skill)) {
      job = new TrainGatheringSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(skill) + 1,
      );
    } else {
      job = new TrainCraftingSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(skill) + 1,
      );
    }
    return this.character.executeJobNow(job, true, true, this.objectiveId);
  }

  /**
   * @description Miner should make sure there are at least ~100 (maybe increase the value?) of each bar in the bank
   * @todo Maybe make this raw ore instead of crafted bars? Or have another function to top up the ore
   */
  private async topUpMiningBars(): Promise<boolean> {
    const minNumRequired = 100

    const barResponse = await getAllItemInformation({craft_skill: 'mining', type: 'resource'})
    if (barResponse instanceof ApiError) {
      return this.character.handleErrors(barResponse)
    }
    const barInfo: ItemSchema[] = barResponse.data.filter((item) => item.subtype === 'bar');

    for (const bar of barInfo) {
      if (bar.craft.level > this.character.data.mining_level) {
        logger.debug(`Not high enough level to craft ${bar.code}`)
        break;
      }

      const numInBank = await this.character.checkQuantityOfItemInBank(bar.code)
      if (numInBank > minNumRequired) {
        logger.debug(`${numInBank}/${minNumRequired} ${bar.code} in bank already`)
        break;
      }

      logger.info(`Crafting ${minNumRequired - numInBank} ${bar.code} to top up to 100`)

      return await this.character.craftNow(minNumRequired - numInBank, bar.code)
    }

    logger.info(`Already have the minimum amount of each bar`)
    return true
  }
}
