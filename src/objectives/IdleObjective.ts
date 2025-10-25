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
    super(character, `idle_${role}_objective`, 'not_started');

    this.character = character;
    this.role = role;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    await this.cleanUpBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.depositGoldIntoBank(1000);
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return true;

    if (
      (this.role === 'weaponcrafter' &&
        this.character.data.level < this.character.data.weaponcrafting_level) ||
      (this.role === 'gearcrafter' &&
        this.character.data.level < this.character.data.gearcrafting_level)
    ) {
      await this.doMonsterTask(5);
      if (this.checkIdleJobIsLast()) return true;
    } else {
      await this.doItemTask(5);
      if (this.checkIdleJobIsLast()) return true;
    }

    switch (this.role) {
      case 'alchemist':
        await this.trainSkill('alchemy');
        if (this.checkIdleJobIsLast()) return true;
        break;
      case 'fisherman':
        await this.trainSkill('fishing');
        if (this.checkIdleJobIsLast()) return true;
        break;
      case 'gearcrafter':
        // We want our gearcrafter to be able to craft gear for our fighter so ideally we'd craft stuff above our level
        // ToDo: This might run into issues with gathering mob drops if the gearcrafter isn't high enough to fight them
        if (
          this.character.getCharacterLevel('gearcrafting') <
          this.character.getCharacterLevel()
        ) {
          await this.trainSkill('gearcrafting');
          if (this.checkIdleJobIsLast()) return true;
        } else {
          await this.trainSkill();
          if (this.checkIdleJobIsLast()) return true;
        }
        break;

      case 'jewelrycrafter':
        await this.trainSkill('jewelrycrafting');
        if (this.checkIdleJobIsLast()) return true;
        break;

      case 'lumberjack':
        await this.trainSkill('woodcutting');
        if (this.checkIdleJobIsLast()) return true;
        break;
      case 'miner':
        await this.trainSkill('mining');
        if (this.checkIdleJobIsLast()) return true;
        break;
      case 'weaponcrafter':
        // We want our weaponcrafting to be at least our character level (if not above??)
        if (
          this.character.getCharacterLevel('weaponcrafting') <
          this.character.getCharacterLevel()
        ) {
          await this.trainSkill('weaponcrafting');
          if (this.checkIdleJobIsLast()) return true;
        } else {
          await this.trainSkill();
          if (this.checkIdleJobIsLast()) return true;
        }
        break;
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
   * Craft certain items and recycle items depending on role
   * @returns true if successful, false if not
   */
  private async cleanUpBank(): Promise<boolean> {
    const job = new TidyBankObjective(this.character, this.role);
    return await this.character.executeJobNow(
      job,
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   * - 1k Health potions of varying levels
   * - 1k Food of varying levels
   * - x Task coins (maybe?)
   */
  private async topUpBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minimumInBank = 100;
    const listOfFish = [
      'cooked_gudgeon',
      'cooked_shrimp',
      'cooked_trout',
      'cooked_bass',
      'cooked_salmon',
    ];

    if (this.role === 'alchemist') {
      for (const potion of this.character.utilitiesMap['restore']) {
        if (potion.craft.level < this.character.getCharacterLevel('alchemy')) {
          const numInBank = await this.character.checkQuantityOfItemInBank(
            potion.code,
          );
          if (numInBank < minimumInBank) {
            await this.character.craftNow(
              minimumInBank - numInBank,
              potion.code,
            );
          }
        }
      }
      for (const potion of this.character.utilitiesMap['antipoison']) {
        if (potion.craft.level < this.character.getCharacterLevel('alchemy')) {
          const numInBank = await this.character.checkQuantityOfItemInBank(
            potion.code,
          );
          if (numInBank < minimumInBank) {
            await this.character.craftNow(
              minimumInBank - numInBank,
              potion.code,
            );
          }
        }
      }
    } else if (this.role === 'fisherman') {
      for (const fish of this.character.consumablesMap['heal'].filter(
        (consumable) => listOfFish.includes(consumable.code),
      )) {
        if (fish.craft.level < this.character.getCharacterLevel('fishing')) {
          // If we can cook the fish, get the number in the bank
          const numInBank = await this.character.checkQuantityOfItemInBank(
            fish.code,
          );
          // Ensure quantity is greater than 100
          if (numInBank < minimumInBank) {
            await this.character.craftNow(minimumInBank - numInBank, fish.code);
          }
        }
      }
    } else if (this.role === 'miner') {
      await this.topUpMiningBars();
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
    return await this.character.executeJobNow(
      job,
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * @description Miner should make sure there are at least ~100 (maybe increase the value?) of each bar in the bank
   * @todo Maybe make this raw ore instead of crafted bars? Or have another function to top up the ore
   */
  private async topUpMiningBars(): Promise<boolean> {
    const minNumRequired = 100;

    const barResponse = await getAllItemInformation({
      craft_skill: 'mining',
      type: 'resource',
    });
    if (barResponse instanceof ApiError) {
      return this.character.handleErrors(barResponse);
    }
    const barInfo: ItemSchema[] = barResponse.data.filter(
      (item) => item.subtype === 'bar',
    );

    for (const bar of barInfo) {
      if (bar.craft.level > this.character.data.mining_level) {
        logger.debug(`Not high enough level to craft ${bar.code}`);
        break;
      }

      const numInBank = await this.character.checkQuantityOfItemInBank(
        bar.code,
      );
      if (numInBank > minNumRequired) {
        logger.debug(
          `${numInBank}/${minNumRequired} ${bar.code} in bank already`,
        );
        break;
      }

      logger.info(
        `Crafting ${minNumRequired - numInBank} ${bar.code} to top up to 100`,
      );

      return await this.character.craftNow(
        minNumRequired - numInBank,
        bar.code,
      );
    }

    logger.info(`Already have the minimum amount of each bar`);
    return true;
  }
}
