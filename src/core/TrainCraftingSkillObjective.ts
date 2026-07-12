import {
  getAllItemInformation,
  getItemInformation,
} from '../api_calls/Items.js';
import {
  CraftSkill,
  GetAllItemsItemsGetParams,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @description Trains the desired crafting skill until reaching the desired level
 * Crafts 1 item at a time
 */
export class TrainCraftingSkillObjective extends Objective {
  skill: CraftSkill;
  targetLevel: number;
  /**
   * Range within the character level that they should craft. Defaults to 9
   * so that skill level 29 will craft lvl 20-29 items, skill level 30 will only
   * craft lvl 21-30 items
   */
  levelRange?: number;

  constructor(
    character: Character,
    skill: CraftSkill,
    targetLevel: number,
    levelRange?: number,
  ) {
    super(character, `train_${targetLevel}_${skill}`, 'not_started');
    this.character = character;
    this.jobFlavour = 'TrainCraftingSkill';
    this.targetLevel = targetLevel;
    this.skill = skill;
    this.levelRange = levelRange ?? 9;
    this.shouldEmitMetrics = true;
    this.metricLabel = skill;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let charLevel = this.character.getCharacterLevel(
      this.character.data,
      this.skill,
    );

    let numToCraft: number;
    switch (this.skill) {
      case 'alchemy':
      case 'cooking':
      case 'mining':
        numToCraft = 10;
        break;
      case 'weaponcrafting':
      case 'gearcrafting':
        numToCraft = 2;
        break;
      default:
        numToCraft = 1;
    }

    while (charLevel < this.targetLevel) {
      if (!(await this.checkStatus())) return false;

      // Get bank items so we don't need to make lots of bank calls
      const allBankItems = await this.character.getAllBankItems();

      logger.debug(
        `Finding craftable ${this.skill} items between ${Math.max(charLevel - this.levelRange, 0)} and ${charLevel}`,
      );

      const payload: GetAllItemsItemsGetParams = {
        craft_skill: this.skill,
        max_level: charLevel,
        min_level: Math.max(charLevel - this.levelRange, 0),
      };

      const craftableItemsListData = await getAllItemInformation(payload);
      if (craftableItemsListData instanceof ApiError) {
        return await this.character.handleErrors(craftableItemsListData);
      }

      const craftableItemsList = craftableItemsListData.data;
      if (craftableItemsList.length === 0) {
        logger.error(`No craftable items found. This shouldn't happen?`);
        return false;
      }

      // Weaponcrafter ensures we have 2 of every tool first
      if (this.skill === 'weaponcrafting') {
        for (const craftableItem of craftableItemsList) {
          if (craftableItem.subtype !== 'tool') {
            logger.debug(
              `[train_${this.skill}] Skipping ${craftableItem.code} because it's not a tool`,
            );
            continue;
          }
          logger.debug(`Checking ${craftableItem.code} count in bank`);
          const bankItem = allBankItems.find(
            (bankItem) => craftableItem.code === bankItem.code,
          );

          if (!bankItem || bankItem.quantity < 2) {
            logger.debug(
              `Crafting ${craftableItem.code} because there aren't enough in bank`,
            );
            if (await this.character.craftNow(numToCraft, craftableItem.code)) {
              // Only deposit if the craft was successful
              await this.character.depositNow(numToCraft, craftableItem.code);
            }
          }

          // Check if character has reached the level goal
          if (
            this.character.getCharacterLevel(this.character.data, this.skill) >=
            this.targetLevel
          ) {
            return true;
          }
        }
      }
      // Then move on to crafting 2 of every other item
      for (const craftableItem of craftableItemsList) {
        logger.debug(`Checking ${craftableItem.code} count in bank`);
        const bankItem = allBankItems.find(
          (bankItem) => craftableItem.code === bankItem.code,
        );

        if (!bankItem || bankItem.quantity < 2) {
          logger.debug(
            `Crafting ${craftableItem.code} because there aren't enough in bank`,
          );
          if (await this.character.craftNow(numToCraft, craftableItem.code)) {
            // Only deposit if the craft was successful
            await this.character.depositNow(numToCraft, craftableItem.code);
          }
        }
        // Check if character has reached the level goal
        if (
          this.character.getCharacterLevel(this.character.data, this.skill) >=
          this.targetLevel
        ) {
          return true;
        }
      }

      // Find item with the best crafting score
      const itemToCraft = await calculateBestCraftingItem(
        this.character,
        craftableItemsList,
        allBankItems,
      );

      logger.debug(
        `Found ${itemToCraft.code} item to craft with score ${itemToCraft.score}`,
      );

      if (await this.character.craftNow(numToCraft, itemToCraft.code)) {
        // Only deposit if the craft was successful
        await this.character.depositNow(numToCraft, itemToCraft.code);
      }

      // Recycle excess gear to get materials
      await this.character.tidyUpBank(this.character.role);

      charLevel = this.character.getCharacterLevel(
        this.character.data,
        this.skill,
      );
    }
    return true;
  }
}

/**
 * Calculates the 'cheapest' item to craft. These scorings are somewhat arbitrary at
 * the moment and will be adjusted.
 * Scoring is based on the following criteria (lowest score is best):
 * - All ingredients in bank/inv: 0
 * - Some ingredients in bank/inv: 1 per ingredient
 * - Gathering: 30 per item needed (approx time to gather 1 resource)
 * - Mob Drop: 30 per fight * (100 - drop rate %)
 * - Task Reward: 200 items * 30 seconds = 6000 score
 * - Event drops: amount needed * (30 seconds if event is active OR 1000 if event is not active)
 *
 * @todo - Make the scores based on actual figures and calculations
 * Gathering: Factor skill level and equipment cooldown in
 */
async function calculateBestCraftingItem(
  character: Character,
  craftableItemList: ItemSchema[],
  bankItems: SimpleItemSchema[],
): Promise<{ code: string; score: number }> {
  let bestScore = 1000000;
  let bestItem = 'no_item';

  logger.debug(
    `Example items in craftable list: ${craftableItemList[0].code}, ${craftableItemList[craftableItemList.length - 1].code}`,
  );

  for (const item of craftableItemList) {
    logger.debug(`Calculating score of ${item.code}`);
    const currentScore = await calculateScore(item, bankItems, character);

    if (currentScore < bestScore) {
      logger.debug(
        `${item.code} (${currentScore}) is better to craft than ${bestItem} (${bestScore})`,
      );
      bestScore = currentScore;
      bestItem = item.code;
    }
  }

  return { code: bestItem, score: bestScore };
}

/**
 * Returns the score of the craftable item
 * Takes in the bank items as input so we don't repeat calls to get bank items
 * @param craftableItem
 */
async function calculateScore(
  craftableItem: ItemSchema,
  bankItems: SimpleItemSchema[],
  character: Character,
): Promise<number> {
  let score = 0;

  if (craftableItem.type === 'resource') {
    logger.debug(`${craftableItem.code} is a resource. Adding score 1`);
    score += 1;
    return score;
  }

  let ingredients = craftableItem.craft.items;

  /**
   * Check how to retrieve each ingredient and update score based on each type
   * Check inventory
   * Check bank
   * Check item type
   */
  for (const simpleIngredient of ingredients) {
    const ingredSchema = await getItemInformation(simpleIngredient.code);
    if (ingredSchema instanceof ApiError) {
      logger.warn(
        `Failed to load ingredient ${simpleIngredient.code}: ${ingredSchema.message}`,
      );
      continue;
    }

    const numNeeded = simpleIngredient.quantity;

    if (ingredSchema.subtype === 'task') {
      logger.debug(
        `${ingredSchema.code} is a task reward, adding ${150 * numNeeded} to score (${score})`,
      );
      score += 150 * numNeeded;
    } else if (ingredSchema.subtype === 'mob') {
      // ToDo: Change this so that it looks at all mobs that drop it
      // and find the best mob to fight
      const monsterToKill = character.monsterData.find((mob) =>
        mob.drops.some((drop) => drop.code === ingredSchema.code),
      );
      if (!monsterToKill) {
        score += 1000000;
        continue;
      }

      const dropRate = monsterToKill.drops.find(
        (drop) => drop.code === ingredSchema.code,
      );
      const scoreToAdd = 2 * dropRate.rate * numNeeded;
      logger.debug(
        `${monsterToKill.code} drops ${ingredSchema.code}. Adding ${scoreToAdd} to score (${score})`,
      );
      score += scoreToAdd;
    } else if (ingredSchema.craft) {
      logger.debug(`Calculating sub-ingredients of ${ingredSchema.code}`);
      for (const simpleSubIngredient of ingredSchema.craft.items) {
        logger.debug(`Calculating ${simpleSubIngredient.code} score`);
        const subIngredient = await getItemInformation(
          simpleSubIngredient.code,
        );
        if (subIngredient instanceof ApiError) {
          logger.warn(
            `Failed to load sub-ingredient ${simpleSubIngredient.code}: ${subIngredient.message}`,
          );
          continue;
        }
        score += await calculateScore(subIngredient, bankItems, character);
      }
    }
  }

  return score;
}
