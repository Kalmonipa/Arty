import { getAllItemInformation } from '../api_calls/Items.js';
import { Role } from '../types/CharacterData.js';
import { CraftSkill, ItemSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
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

  role: Role;

  constructor(character: Character, role: Role) {
    super(character, `tidy_bank`, 'not_started');

    this.character = character;
    this.role = role;
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
    switch (this.role) {
      case 'alchemist':
        break;
      case 'fisherman':
        return await this.cookFish();

      case 'fighter':
        return await this.recycleExcessWeapons()

      case 'lumberjack':
        break;
      case 'miner':
        return await this.craftBars();

      default:
        break;
    }

    return true;
  }

  /**
   * Finds any raw fish in the bank and cooks it
   * @returns true if successful or false if it failed
   */
  private async cookFish(): Promise<boolean> {
    for (const item of this.rawFishList) {
      const numInBank = await this.character.checkQuantityOfItemInBank(item);
      if (numInBank == 0) {
        break;
      } else {
        const itemToCraftSchema = await this.identifyCraftedItemFrom(
          item,
          'cooking',
        );
        if (!itemToCraftSchema) {
          break;
        }

        const numToCraft = Math.floor(
          numInBank / itemToCraftSchema.craft.items[0].quantity,
        );

        return await this.character.craftNow(numToCraft, item);
      }
    }
    logger.info(`Found no fish in the bank to clean up`);
    return true;
  }

  /**
   * @description Finds any raw ore in the bank and crafts it into bars
   * @returns 
   */
  private async craftBars(): Promise<boolean> {
    for (const item of this.rawOreList) {
      const numInBank = await this.character.checkQuantityOfItemInBank(item);
      if (numInBank == 0) {
        break;
      } else {
        const itemToCraftSchema = await this.identifyCraftedItemFrom(
          item,
          'mining',
        );
        if (!itemToCraftSchema) {
          break;
        }

        const numToCraft = Math.floor(
          numInBank / itemToCraftSchema.craft.items[0].quantity,
        );

        return await this.character.craftNow(numToCraft, item);
      }
    }
    logger.info(`Found no ore in the bank to clean up`);
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
    const craftedItemList = await getAllItemInformation({
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
    for (const craftItem of craftedItemList.data) {
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

  /**
   * @description Recycle any weapons that we have more than 5 of in the bank
   * @todo Do this for gear as well
   */
  private async recycleExcessWeapons() {
    const maxNumberNeededInBank = 5
    for (const weaponList of Object.values(this.character.weaponMap)) {
      for (const weapon of weaponList) {
        if (weapon.level > this.character.data.weaponcrafting_level) {
          logger.debug(`Not high enough level to recycle ${weapon.code}`)
          break;
        }

        const numInBank = await this.character.checkQuantityOfItemInBank(weapon.code)
        if (numInBank < maxNumberNeededInBank) {
          logger.debug(`Less than ${maxNumberNeededInBank} so no need to recycle`)
          break;
        } 

        return await this.character.recycleItemNow(weapon.code, numInBank - maxNumberNeededInBank)
      }
    }
    logger.info(`Found no weapons to recycle`)
  }
}
