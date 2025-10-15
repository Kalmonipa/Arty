import { getAllItemInformation } from '../api_calls/Items.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { DataPageResourceSchema, GatheringSkill } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @todo
 * - Alchemy requires crafting potions after level 30 to level up past. Gathering nettles doesn't provide exp at level 31
 */
export class TrainGatheringSkillObjective extends Objective {
  skill: GatheringSkill;
  targetLevel: number;

  constructor(
    character: Character,
    skill: GatheringSkill,
    targetLevel: number,
  ) {
    super(character, `train_${targetLevel}_${skill}`, 'not_started');
    this.character = character;
    this.targetLevel = targetLevel;
    this.skill = skill;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let charLevel = this.character.getCharacterLevel(this.skill);
    while (charLevel < this.targetLevel) {
      if (!(await this.checkStatus())) return false;

      const resourceTypes: DataPageResourceSchema | ApiError =
        await getAllResourceInformation({
          skill: this.skill,
          max_level: charLevel,
        });
      if (resourceTypes instanceof ApiError) {
        return this.character.handleErrors(resourceTypes);
      }

      const resourceToGather =
        resourceTypes.data[resourceTypes.data.length - 1].drops[0].code;

      await this.character.gatherNow(
        Math.round(this.character.data.inventory_max_items * 0.8),
        resourceToGather,
        false,
      );

      const numGathered =
        this.character.checkQuantityOfItemInInv(resourceToGather);

      await this.craftItem(resourceToGather, numGathered);

      await this.character.depositAllItems();

      charLevel = this.character.getCharacterLevel(this.skill);
    }
    return true;
  }

  /**
   * @description If the ingredient only has 1 potential item to craft it into, and the item only needs this 1 ingredient, craft it
   * This is primarily for fish, potions, early ore and early wood
   * @param ingredientCode The code of the ingredient we have
   * @param ingredientQuantity The amount of the ingredient we have
   * @returns true if successful
   */
  private async craftItem(
    ingredientCode: string,
    ingredientQuantity: number,
  ): Promise<boolean> {
    const potentialCraftableItems = await getAllItemInformation({
      craft_material: ingredientCode,
    });
    if (potentialCraftableItems instanceof ApiError) {
      this.character.handleErrors(potentialCraftableItems);
      return false;
    }

    if (
      potentialCraftableItems.data.length === 1 &&
      potentialCraftableItems.data[0].craft.items.length === 1
    ) {
      const skillNeeded = potentialCraftableItems.data[0].craft.skill;
      const levelNeeded = potentialCraftableItems.data[0].craft.level;
      const charLevel = this.character.getCharacterLevel(skillNeeded);
      if (charLevel > potentialCraftableItems.data[0].craft.level) {
        const craftableQuantity = Math.floor(
          ingredientQuantity /
            potentialCraftableItems.data[0].craft.items[0].quantity,
        );

        return await this.character.craftNow(
          craftableQuantity,
          potentialCraftableItems.data[0].code,
        );
      } else {
        logger.debug(
          `${skillNeeded} level not high enough to craft ${potentialCraftableItems.data[0].code}. Need ${levelNeeded} but chars is ${charLevel}`,
        );
        return false;
      }
    }
  }
}
