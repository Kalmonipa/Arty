import { getAllItemInformation } from '../api_calls/Items.js';
import { CraftSkill, ItemSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class TidyBankObjective extends Objective {
  //ToDo: get the list of stuff via API
  // Make lists of cooking, mining, etc
  rawFishList = ['gudgeon', 'shrimp', 'trout'];
  rawFoodList = ['raw_beef', 'egg', 'apple', 'raw_chicken'];
  rawOreList = [
    'copper_ore',
    'iron_ore',
    'emerald_stone',
    'ruby_stone',
    'sapphire_stone',
    'topaz_stone',
  ];

  constructor(character: Character) {
    super(character, `tidy_bank`, 'not_started');

    this.character = character;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Picks a random resource to clean up from the available options. Currently just cooks fish
   * @todo
   * - Implement ore, gem fragments, recycling armor/jewellery etc
   * - Clean up resources based on the characters role (this is more of a role based thing but not actually necessary)
   */
  async run(): Promise<boolean> {
    return this.cookFish();
  }

  /**
   * Finds any raw fish in the bank and cooks it
   * @returns true if successful or false if it failed
   */
  async cookFish(): Promise<boolean> {
    for (const item of this.rawFishList) {
      let numInBank = await this.character.checkQuantityOfItemInBank(item);
      if (numInBank == 0) {
        break;
      } else {
        let itemToCraftSchema = await this.identifyCraftedItemFrom(
          item,
          'cooking',
        );
        if (!itemToCraftSchema) {
          break;
        }

        let numToCraft = Math.floor(
          numInBank / itemToCraftSchema.craft.items[0].quantity,
        );

        return await this.character.craftNow(numToCraft, item);
      }
    }
    logger.info(`Found no fish in the bank to clean up`);
    return true;
  }

  /**
   * @description Figures out what we should craft from the ingredient supplied
   * @param ingredient item_code of the raw ingredient in the bank
   * @returns the item_code of the item we should cook
   */
  async identifyCraftedItemFrom(
    ingredient: string,
    craftSkill: CraftSkill,
  ): Promise<ItemSchema> {
    let craftedItemList = await getAllItemInformation({
      craft_material: ingredient,
      craft_skill: craftSkill,
      max_level: this.character.getCharacterLevel(craftSkill),
    });
    if (craftedItemList instanceof ApiError) {
      this.character.handleErrors(craftedItemList);
      return;
    } else if (craftedItemList.data.length === 0) {
      logger.info(
        `${craftSkill} isn't high enough to craft anything. Skipping`,
      );
      return;
    }

    // ToDo: we should make a better decision somehow if there are multiple options
    // Currently this just picks one that only requires 1 ingredient
    for (let craftItem of craftedItemList.data) {
      if (craftItem.craft.items.length > 1) {
        logger.debug(
          `${craftItem.code} requires more than 1 ingredient. Skipping`,
        );
        continue;
      } else {
        return craftedItemList[0];
      }
    }
    return;
  }
}
