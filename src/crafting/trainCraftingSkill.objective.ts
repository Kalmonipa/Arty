import { getAllItemInformation } from '../api_calls/Items.js';
import { CraftSkill, GetAllItemsItemsGetParams } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { BankCache } from '../bank/bank.cache.js';
import { ApiError } from '../core/error.js';
import { Objective } from '../core/objective.js';
import { calculateBestCraftingItem } from './crafting.utils.js';
import {
  Alchemy,
  Cooking,
  Gearcrafting,
  Jewelrycrafting,
  Mining,
  Weaponcrafting,
  Woodcutting,
} from '../gameDataConstants.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

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
    // If an ingredient must come from another role, wishlist it and park this
    // job until it's fulfilled rather than failing the craft outright.
    this.parkOnWishlistRequest = true;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async run(): Promise<ObjectiveResult> {
    let charLevel = this.character.getCharacterLevel(
      this.character.data,
      this.skill,
    );

    let numToCraft: number;
    switch (this.skill) {
      case Alchemy:
      case Cooking:
      case Mining:
      case Woodcutting:
        numToCraft = 10;
        break;
      case Weaponcrafting:
      case Gearcrafting:
      case Jewelrycrafting:
        numToCraft = 5;
        break;
      default:
        numToCraft = 1;
    }

    while (charLevel < this.targetLevel) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      // If a previous iteration wishlisted ingredients it couldn't obtain, stop
      // so this job gets parked (onHold) until they're fulfilled — otherwise the
      // loop would spin without ever levelling up.
      if (await this.hasUnfulfilledRequests()) {
        return ObjectiveFailed;
      }

      // One snapshot for the whole scoring pass, which reads the bank once for
      // work that would otherwise re-read it per candidate ingredient.
      const bankSnapshot = await BankCache.create(this.character);
      if (bankSnapshot.stale) {
        logger.warn('Could not read the bank; deferring this crafting pass');
        return ObjectiveFailed;
      }

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
        await this.character.handleErrors(craftableItemsListData);
        return ObjectiveFailed;
      }

      const craftableItemsList = craftableItemsListData.data;
      if (craftableItemsList.length === 0) {
        logger.error(`No craftable items found. This shouldn't happen?`);
        return ObjectiveFailed;
      }

      if (!(await this.checkStatus())) return ObjectiveCancelled;

      // If there is each piece of equipment in the bank then we move on to finding the
      // most efficient item to craft to level up the skill
      const itemToCraft = await calculateBestCraftingItem(
        this.character,
        craftableItemsList,
        numToCraft,
        bankSnapshot,
      );

      logger.debug(
        `Found ${itemToCraft.code} item to craft with score ${itemToCraft.score}`,
      );

      if (
        await this.character.craftNow(
          numToCraft,
          itemToCraft.code,
          false,
          undefined,
          true,
        )
      ) {
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
    return ObjectiveCompleted;
  }
}
