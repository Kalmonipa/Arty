import { actionClaimPendingItems, getAllItemInformation, getPendingItems } from '../api_calls/Items.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import { Role } from '../types/CharacterData.js';
import { ItemSchema, Skill } from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { ItemTaskObjective } from './ItemTaskObjective.js';
import { MonsterTaskObjective } from './MonsterTaskObjective.js';
import { Objective } from './Objective.js';
import { TrainCombatObjective } from './TrainCombatObjective.js';
import { TrainCraftingSkillObjective } from './TrainCraftingSkillObjective.js';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjective.js';

export class IdleObjective extends Objective {
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
    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return true;

    await this.depositGoldIntoBank(2000);
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return true;

    // Alchemist never does tasks — sole responsibility is crafting potions.
    // All other roles only do tasks if the bank is low on task coins.
    // Fisherman has an additional check: food must be sufficiently stocked first.
    if (this.role !== 'alchemist') {
      const taskCoinsInBank = await this.character.checkQuantityOfItemInBank('tasks_coin');

      if (taskCoinsInBank < 100) {
        let shouldDoTasks = true;

        if (this.role === 'fisherman') {
          shouldDoTasks = await this.isFishSufficientlyStocked();
        }

        if (shouldDoTasks) {
          // Weapon, gear and jewelrycrafters do monster tasks if their crafting level
          // exceeds their combat level, otherwise item tasks
          if (
            (this.role === 'weaponcrafter' &&
              this.character.data.level < this.character.data.weaponcrafting_level) ||
            (this.role === 'gearcrafter' &&
              this.character.data.level < this.character.data.gearcrafting_level) ||
            (this.role === 'jewelrycrafter' &&
              this.character.data.level < this.character.data.jewelrycrafting_level)
          ) {
            await this.doMonsterTask(5);
          } else {
            await this.doItemTask(5);
          }
          if (this.checkIdleJobIsLast()) return true;
        }
      }
    }

    // Train skills depending on their role
    // If the skill gets 5 levels ahead of their combat level then they won't train the skill any further
    // There's no need for skills to get too far ahead of combat level
    switch (this.role) {
      case 'alchemist':
        if (
          this.character.getCharacterLevel(this.character.data, 'alchemy') >=
          this.character.getCharacterLevel(this.character.data) + 5
        ) {
          await this.fightMobWithinLevelRange();
        } else {
          await this.trainSkill('alchemy');
        }
        if (this.checkIdleJobIsLast()) return true;
        break;
      case 'fisherman':
        await this.trainSkill('fishing');
        if (this.checkIdleJobIsLast()) return true;
        await this.fightMobWithinLevelRange();
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

      // Crafting skills should aim to be at the combat level
      case 'gearcrafter':
        if (
          this.character.getCharacterLevel(
            this.character.data,
            'gearcrafting',
          ) < this.character.getCharacterLevel(this.character.data)
        ) {
          await this.trainSkill('gearcrafting');
          if (this.checkIdleJobIsLast()) return true;
        } else {
          await this.trainSkill();
          if (this.checkIdleJobIsLast()) return true;
        }
        break;
      case 'jewelrycrafter':
        if (
          this.character.getCharacterLevel(
            this.character.data,
            'jewelrycrafting',
          ) < this.character.getCharacterLevel(this.character.data)
        ) {
          await this.trainSkill('jewelrycrafting');
          if (this.checkIdleJobIsLast()) return true;
        } else {
          await this.trainSkill();
          if (this.checkIdleJobIsLast()) return true;
        }
        break;
      case 'weaponcrafter':
        if (
          this.character.getCharacterLevel(
            this.character.data,
            'weaponcrafting',
          ) < this.character.getCharacterLevel(this.character.data)
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
        const numInBank = await this.character.checkQuantityOfItemInBank(fish.code);
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
      logger.info(`Claiming item ${pendingItem.description} from ${pendingItem.source}`)
      const claimResponse = await actionClaimPendingItems(this.character.data, pendingItem.id);
      if (claimResponse instanceof ApiError) {
        await this.character.handleErrors(claimResponse);
      }
    }
    return true;
  }

  /**
   * Looks at certain achievements to see if we can make progress towards any of them
   * I have a feeling this might be mostly hardcoding for specific achievements.
   * @returns true if successful, false if not
   */
  private checkAchievementProgress(): boolean {
    return true;
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   * - 100 Health potions of varying levels
   * - 500 Food of varying levels
   * - x Task coins (maybe?)
   */
  private async topUpBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minimumPotionInBank = 100;
    const minimumFoodInBank = 500;

    // Alchemist should craft 200 of every usable health potion, the floor being the lowest character level
    // and the ceiling being either the alchemists alchemy level or the highest character level
    if (this.role === 'alchemist') {
      const minPotionsToCraft = minimumPotionInBank * 2;
      for (const potion of this.character.utilitiesMap['restore'].reverse()) {
        if (
          potion.craft.level <=
            this.character.getCharacterLevel(this.character.data, 'alchemy') &&
          potion.craft.level <= this.character.highestCharLevel &&
          potion.craft.level >= this.character.lowestCharLevel
        ) {
          logger.info(`Crafting ${minPotionsToCraft} ${potion.code}`);
          await this.character.craftNow(minPotionsToCraft, potion.code);
          break;
        }
      }

      for (const potion of this.character.utilitiesMap['antipoison']) {
        if (
          potion.craft.level <
          this.character.getCharacterLevel(this.character.data, 'alchemy')
        ) {
          const numInBank = await this.character.checkQuantityOfItemInBank(
            potion.code,
          );
          if (numInBank < minimumPotionInBank) {
            await this.character.craftNow(
              minimumPotionInBank - numInBank,
              potion.code,
            );
          }
        }
      }
    } else if (this.role === 'fisherman') {
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
            await this.character.craftNow(minimumFoodInBank - numInBank, fish.code);
          }
        }
      }
    } else if (this.role === 'miner') {
      await this.topUpMiningBars();
    }

    return true;
  }

  /**
   * Finds a normal mob within a level range below the character's combat level and fights it 10 times.
   */
  private async fightMobWithinLevelRange(minOffset: number = 4, maxOffset: number = 6): Promise<boolean> {
    const charLevel = this.character.getCharacterLevel(this.character.data);

    const mobs = await getAllMonsterInformation({
      min_level: Math.max(charLevel - maxOffset, 0),
      max_level: Math.max(charLevel - minOffset, 0),
    });

    if (mobs instanceof ApiError) {
      return this.character.handleErrors(mobs);
    }

    const normalMobs = mobs.data.filter((mob) => mob.type === 'normal');

    if (normalMobs.length === 0) {
      logger.info(
        `No normal mobs found ${minOffset}-${maxOffset} levels below combat level ${charLevel}. Skipping combat`,
      );
      return true;
    }

    // Results are sorted ascending by level — pick the highest in range
    const mob = normalMobs[normalMobs.length - 1];

    await this.character.evaluateGear('combat', mob.code);
    return await this.character.fightNow(10, mob.code, undefined, false);
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
