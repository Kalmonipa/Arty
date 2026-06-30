import { getAllItemInformation } from '../api_calls/Items.js';
import {
  CraftSkill,
  GetAllItemsItemsGetParams,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
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
   * Range within the character level that they should craft. Defaults to 4
   * Useful to only craft higher level items during trainSkill objectives when there are
   * items to craft every 5 levels (e.g weapon/gear crafting)
   * Alchemy for example only has items every 10 levels so setting a range of 5 levels wouldn't
   * work for that
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
    this.levelRange = levelRange ?? 4;
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

    while (charLevel < this.targetLevel) {
      if (!(await this.checkStatus())) return false;

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

      const randInd = Math.floor(Math.random() * craftableItemsList.length);

      const itemToCraft = craftableItemsList[randInd];

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
async function calculateEquipmentCraftingScore(
  character: Character,
  craftableItemList: ItemSchema[],
): Promise<number> {
  let score = 0;

  const bankItems = await character.getAllBankItems();

  for (const item of craftableItemList) {
  }

  return 1;
}

/**
 * Returns the score of the craftable item
 * Takes in the bank items as input so we don't repeat calls to get bank items
 * @param craftableItem
 */
function calculateScore(
  craftableItem: ItemSchema,
  bankItems: SimpleItemSchema[],
  character: Character,
): number {
  if (!craftableItem.craft && craftableItem.craft.items) {
    logger.debug(`${craftableItem.code} not craftable. Skipping`);
    return 1000000;
  }

  let score = 0;

  let ingredients = craftableItem.craft.items;

  /**
   * Check how to retrieve each ingredient and update score based on each type
   * Check inventory
   * Check bank
   * Check item type
   */
  ingredients.forEach((simpleIngredient) => {
    const ingredSchema = character.itemData.find(
      (itemCode) => itemCode.code === simpleIngredient.code,
    );

    const numInInv = character.data.inventory.find(
      (item) => item.code === ingredSchema.code,
    ).quantity;
    if (numInInv >= simpleIngredient.quantity) {
      logger.debug(
        `${numInInv}/${simpleIngredient.quantity} ${simpleIngredient.code} in inventory. Score is ${score}`,
      );
      score += 0;
      return;
    }

    const numInBank = bankItems.find(
      (item) => item.code === ingredSchema.code,
    ).quantity;

    if (numInBank >= simpleIngredient.quantity) {
      logger.debug(
        `${numInBank}/${simpleIngredient.quantity} ${simpleIngredient.code} in bank. Score is ${score}`,
      );
      score += 0;
      return;
    }

    const numAvailableWithoutGathering = numInBank + numInInv;

    if (numAvailableWithoutGathering >= simpleIngredient.quantity) {
      logger.debug(
        `${numAvailableWithoutGathering}/${simpleIngredient.quantity} ${simpleIngredient.code} in bank + inventory. Score is ${score}`,
      );
      score += 0;
      return;
    }

    const numNeeded = simpleIngredient.quantity - numAvailableWithoutGathering;

    if (ingredSchema.subtype === 'task') {
      logger.debug(
        `${ingredSchema.code} is a task reward, adding ${10 * simpleIngredient.quantity} to score (${score})`,
      );
      score += 10 * simpleIngredient.quantity;
    } else if (ingredSchema.craft) {
      logger.debug(`Calculating sub-ingredients of ${ingredSchema.code}`);
      ingredSchema.craft.items.forEach((simpleSubIngredient) => {
        logger.debug(`Calculating ${simpleSubIngredient.code} score`);
        const subIngredient = character.itemData.find(
          (item) => item.code === simpleSubIngredient.code,
        );
        score += calculateScore(subIngredient, bankItems, character);
      });
    } else if (ingredSchema.subtype === 'mob') {
      // ToDo: Change this so that it looks at all mobs that drop it
      // and find the best mob to fight
      const monsterToKill = character.monsterData.find(mob => {
        mob.drops.find(drop => drop.code === ingredSchema.code)
      })
      // const monstersThatDrop = character.monsterData.filter(mob => {
      //   mob.drops.find(drop => drop.code === ingredSchema.code)
      // })

      const dropRate = monsterToKill.drops.find(drop => drop.code === ingredSchema.code)
      const scoreToAdd = 2 * dropRate.rate * numNeeded
      logger.debug(`${monsterToKill.code} drops ${ingredSchema.code}. Adding ${scoreToAdd} to score (${score})`)
      score += scoreToAdd
    }
  });
}
