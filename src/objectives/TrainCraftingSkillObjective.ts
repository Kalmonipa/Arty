import { getAllItemInformation } from '../api_calls/Items.js';
import { CraftSkill, GetAllItemsItemsGetParams } from '../types/types.js';
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
    this.targetLevel = targetLevel;
    this.skill = skill;
    this.levelRange = levelRange ?? 4;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let charLevel = this.character.getCharacterLevel(this.skill);

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

      charLevel = this.character.getCharacterLevel(this.skill);
    }
    return true;
  }
}
