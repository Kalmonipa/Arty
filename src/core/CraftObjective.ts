import { actionCraft } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { isSkill, logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getItemInformation } from '../api_calls/Items.js';
import {
  GatheringSkill,
  ItemSchema,
  SimpleItemSchema,
  Skill,
} from '../types/types.js';
import { requestCraftItem } from '../api_calls/Account.js';

/**
 * @description Crafts the requested amount of the item
 * @todo
 * - Empty inventory before starting, except for the item or any ingredients
 *
 */
export class CraftObjective extends Objective {
  target: ObjectiveTargets;
  numBatches: number = 1;
  numItemsPerBatch: number;
  checkBank?: boolean;
  includeInventory?: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    checkBank?: boolean,
    includeInventory?: boolean,
  ) {
    super(character, `craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Craft';
    this.target = target;
    this.shouldEmitMetrics = true;
    this.metricLabel = target.code;
    this.checkBank = checkBank;
    this.includeInventory =
      includeInventory !== undefined ? includeInventory : true;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    if (this.includeInventory) {
      const quantyInInv = this.character.checkQuantityOfItemInInv(
        this.target.code,
      );

      if (quantyInInv >= this.target.quantity) {
        // Already have enough, set target to 0 so no crafting is needed
        this.target.quantity = 0;
      } else if (quantyInInv > 0) {
        // Carrying some, so only need to craft the remainder
        this.target.quantity = this.target.quantity - quantyInInv;
      }
    }

    return true;
  }

  /**
   * @description Craft the item. Character will move to the correct workshop map
   */
  async run(): Promise<boolean> {
    if (this.target.quantity === 0) {
      logger.info(
        `Already have the requested amount (${this.target.quantity}) of ${this.target.code}. Completing job`,
      );
      return true;
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      logger.info(`Craft attempt ${attempt}/${this.maxRetries}`);

      const targetItem = await getItemInformation(this.target.code);

      if (targetItem instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(targetItem);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Craft failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        if (!(await this.checkStatus())) return false;

        if (!targetItem.craft) {
          logger.warn(
            `Item ${targetItem.code} has no craft information. Failing`,
          );
          this.character.removeItemFromItemsToKeep(targetItem.code);
          return false;
        }

        // Check if the character has the skill level required to craft
        // if (targetItem.craft && targetItem.craft.skill) {
        //   let charSkillLevel: number = this.character.getCharacterLevel(
        //     this.character.data,
        //     targetItem.craft.skill,
        //   );

        // // ToDo: Add the item to a wishlist instead of requesting it directly
        // if (charSkillLevel < targetItem.craft.level) {
        //   logger.warn(
        //     `Character ${this.character.data.name} has ${targetItem.craft.skill} level ${charSkillLevel} but needs level ${targetItem.craft.level} to craft ${targetItem.code}`,
        //   );
        //   let crafter = this.character.allCharacterDetails.find(
        //     (char) =>
        //       this.character.getCharacterLevel(char, targetItem.craft.skill) >
        //       targetItem.craft.level,
        //   );
        //   if (!crafter) {
        //     logger.warn(
        //       `Found no character capable of crafting ${targetItem.code}`,
        //     );
        //     return false;
        //   }
        //   logger.info(
        //     `Requesting ${this.target.quantity} ${targetItem.code} from ${crafter.name} and continuing`,
        //   );
        //   // let response = await requestCraftItem(crafter.name, {
        //   //   code: this.target.code,
        //   //   quantity: this.target.quantity,
        //   // });
        //   // if (response instanceof ApiError) {
        //   //   logger.error(
        //   //     `${response.error} | Code: [${response.error.code}]`,
        //   //   );
        //   //   return false;
        //   // }

        //   return true;
        // }
        // }

        // Build shopping list so that we can ensure we have enough inventory space to collect everything
        // If not enough inv space, split it into 2 jobs, craft half as much at once
        // If still not enough, keep splitting in half until we have enough inv space
        const batchInfo = this.calculateNumBatches(targetItem.craft.items);
        this.numBatches = batchInfo.numBatches;
        this.numItemsPerBatch = batchInfo.numPerBatch;

        const maps = await getMaps({
          content_code: targetItem.craft.skill,
          content_type: 'workshop',
        });
        if (maps instanceof ApiError) {
          return this.character.handleErrors(maps);
        }

        if (maps.data.length === 0) {
          logger.error(`Cannot find any maps to craft ${this.target.code}`);
          return false;
        }

        const contentLocation = this.character.evaluateClosestMap(maps.data);

        for (let batch = 1; batch <= this.numBatches; batch++) {
          if (this.progress >= this.target.quantity) {
            logger.info(
              `Successfully crafted ${this.progress} ${this.target.code}`,
            );
            return true;
          }

          logger.info(`Crafting batch ${batch}/${this.numBatches}`);

          if (!(await this.checkStatus())) return false;

          // Clamp the final batch to what's still outstanding. numItemsPerBatch
          // is derived from inventory size, so when target.quantity isn't an
          // exact multiple of it the last batch would otherwise over-craft and
          // over-gather ingredients past the target.
          const thisBatch = CraftObjective.batchQuantity(
            this.numItemsPerBatch,
            this.target.quantity,
            this.progress,
          );

          const gathered = await this.gatherIngredients(
            targetItem.craft.items,
            thisBatch,
          );
          if (!gathered) {
            logger.warn(`Gathering ingredients for ${targetItem.code} failed`);
            return false;
          }

          for (const craftItem of targetItem.craft.items) {
            this.character.addItemToItemsToKeep(craftItem.code);

            const numInInvAfterGathering =
              this.character.checkQuantityOfItemInInv(craftItem.code);
            logger.debug(
              `Carrying ${numInInvAfterGathering}/${craftItem.quantity * thisBatch} ${craftItem.code}`,
            );
            if (numInInvAfterGathering < craftItem.quantity * thisBatch) {
              logger.warn(
                `Carrying ${numInInvAfterGathering}/${craftItem.quantity * thisBatch} ${craftItem.code}. Regathering`,
              );

              const gathered = await this.gatherIngredients(
                targetItem.craft.items,
                thisBatch,
              );
              if (!gathered) {
                logger.warn(
                  `Regathering ingredients for ${targetItem.code} has failed`,
                );
                this.character.removeItemFromItemsToKeep(craftItem.code);
                break;
              }
            }
          }

          if (!(await this.checkStatus())) return false;

          if (!(await this.character.move(contentLocation))) {
            logger.error(
              `Could not reach workshop at x: ${contentLocation.x}, y: ${contentLocation.y} to craft ${this.target.code}`,
            );
            return false;
          }

          logger.info(
            `Crafting ${thisBatch} ${this.target.code} at x: ${this.character.data.x}, y: ${this.character.data.y}`,
          );

          const response = await actionCraft(this.character.data, {
            code: this.target.code,
            quantity: thisBatch,
          });

          if (response instanceof ApiError) {
            const shouldRetry = await this.character.handleErrors(response);

            if (!shouldRetry || attempt === this.maxRetries) {
              logger.error(`Craft failed after ${attempt} attempts`);
              return false;
            }
            break;
          } else {
            this.progress += thisBatch;

            if (response.data.character) {
              this.character.data = response.data.character;
            } else {
              logger.error('Craft response missing character data');
            }

            for (const ingredient of targetItem.craft?.items) {
              this.character.removeItemFromItemsToKeep(ingredient.code);
            }

            if (this.numBatches > 1) {
              logger.debug(`Depositing items from batch ${batch}`);
              await this.character.depositNow(thisBatch, this.target.code);
            }

            logger.info(
              `Successfully crafted ${thisBatch} ${this.target.code}`,
            );
          }
        }
        if (
          this.numBatches > 1 &&
          this.target.quantity < this.character.data.inventory_max_items
        ) {
          logger.debug(
            `Withdrawing all ${this.target.quantity} ${this.target.code} from bank`,
          );
          await this.character.withdrawNow(
            this.target.quantity,
            this.target.code,
          );
        }

        return true;
      }
    }

    return false;
  }

  private async gatherIngredients(
    craftingItems: SimpleItemSchema[],
    itemsPerBatch: number,
  ): Promise<boolean> {
    for (const craftingItem of craftingItems) {
      const craftingItemInfo: ItemSchema | ApiError = await getItemInformation(
        craftingItem.code,
      );

      if (craftingItemInfo instanceof ApiError) {
        await this.character.handleErrors(craftingItemInfo);
        this.character.removeItemFromItemsToKeep(craftingItem.code);
        return false;
      }

      logger.debug(
        `Collecting ${craftingItem.quantity * itemsPerBatch} ${craftingItem.code}`,
      );

      let numInInv = this.character.checkQuantityOfItemInInv(craftingItem.code);

      let numInBank = await this.character.checkQuantityOfItemInBank(
        craftingItem.code,
      );

      const totalIngredNeededToCraft = craftingItem.quantity * itemsPerBatch;

      if (numInInv >= totalIngredNeededToCraft) {
        logger.info(
          `${numInInv} ${craftingItem.code} in inventory already. No need to collect more`,
        );
        continue;
      } else if (numInInv > 0) {
        logger.info(
          `${numInInv} ${craftingItem.code} in inventory already. Finding more`,
        );
      }
      if (numInBank >= totalIngredNeededToCraft - numInInv) {
        logger.info(`Found ${numInBank} ${craftingItem.code} in the bank`);
        await this.character.withdrawNow(
          totalIngredNeededToCraft - numInInv,
          craftingItem.code,
        );

        numInInv = this.character.checkQuantityOfItemInInv(craftingItem.code);
      }

      if (numInInv < totalIngredNeededToCraft) {
        if (!(await this.checkStatus())) return false;

        if (craftingItemInfo.subtype === 'mob') {
          logger.debug(`Resource ${craftingItemInfo.code} is a mob drop`);

          if (
            !(await this.character.gatherNow(
              totalIngredNeededToCraft,
              craftingItem.code,
              true,
              true,
            ))
          ) {
            logger.warn(
              `Gathering ${craftingItem.quantity} ${craftingItem.code} has failed`,
            );
            this.character.removeItemListfromItemsToKeep(craftingItems);
            return false;
          }

          if (!(await this.checkStatus())) return false;
          // ToDo: Find a better way to handle items that are craftable and gatherable (i.e. sap)
        } else if (
          craftingItemInfo.craft !== null &&
          craftingItemInfo.code !== 'sap'
        ) {
          logger.debug(`Resource ${craftingItemInfo.code} is a craftable item`);

          if (
            !(await this.character.craftNow(
              totalIngredNeededToCraft - numInInv,
              craftingItem.code,
              true,
              false,
            ))
          ) {
            logger.warn(
              `Crafting ${craftingItem.quantity} ${craftingItem.code} has failed`,
            );
            this.character.removeItemListfromItemsToKeep(craftingItems);
            return false;
          }

          if (!(await this.checkStatus())) return false;
        } else {
          logger.debug(`Resource ${craftingItem.code} is a gatherable item`);

          // Pass the total amount needed, let GatherObjective figure out how many to gather
          if (
            !(await this.character.gatherNow(
              totalIngredNeededToCraft,
              craftingItem.code,
              true,
              true,
            ))
          ) {
            logger.warn(
              `Gathering ${craftingItem.quantity} ${craftingItem.code} has failed`,
            );
            this.character.removeItemListfromItemsToKeep(craftingItems);
            return false;
          }

          if (!(await this.checkStatus())) return false;
        }
      }

      // Ensure that we're carrying the correct amount of ingredients. They may have been deposited into bank
      numInInv = this.character.checkQuantityOfItemInInv(craftingItem.code);
      numInBank = await this.character.checkQuantityOfItemInBank(
        craftingItem.code,
      );
      if (numInInv >= totalIngredNeededToCraft) {
        logger.info(`${numInInv} in inventory. Moving on to craft`);
        continue;
      } else if (numInBank >= totalIngredNeededToCraft - numInInv) {
        return await this.character.withdrawNow(
          totalIngredNeededToCraft - numInInv,
          craftingItem.code,
        );
      } else {
        logger.info(
          `Need ${totalIngredNeededToCraft} but only carrying ${numInInv} and ${numInBank} in the bank`,
        );
      }
    }

    return true;
  }

  /**
   * @description Calculates how many batches we need to split the craft job into
   * Often we don't have enough inventory space to craft them all at once
   * @param craftList
   * @returns
   * - numBatches - The amount of batches to craft
   * - numPerBatch - The amount of items to craft per batch
   */
  /**
   * @description How many items to craft in the current batch: the
   * inventory-derived batch size, clamped to what's still outstanding so the
   * final batch never over-crafts (and over-gathers ingredients) past the
   * target when target.quantity isn't an exact multiple of the batch size.
   */
  static batchQuantity(
    numItemsPerBatch: number,
    targetQuantity: number,
    progress: number,
  ): number {
    return Math.min(numItemsPerBatch, targetQuantity - progress);
  }

  private calculateNumBatches(craftList: SimpleItemSchema[]): {
    numBatches: number;
    numPerBatch: number;
  } {
    const numIngredients = this.getTotalNumberOfIngredients(craftList);

    const batches: { numBatches: number; numPerBatch: number } =
      this.getTotalNumberOfIngredientsPerBatch(
        numIngredients,
        1,
        this.target.quantity,
      );

    return batches;
  }

  /**
   * @description Calculates how many ingredients are needed
   * @returns the total number of ingredients to craft the target number of items
   */
  private getTotalNumberOfIngredients(craftList: SimpleItemSchema[]): number {
    let totalNumIngredients = 0;
    for (const craftItem of craftList) {
      totalNumIngredients += craftItem.quantity * this.target.quantity;
    }
    return totalNumIngredients;
  }

  /**
   * @description Checks if we can carry all the ingredients for a batch at once
   * If not, return false, telling the caller to split it in half
   */
  private getTotalNumberOfIngredientsPerBatch(
    totalNumIngredients: number,
    numBatches: number,
    numPerBatch: number,
  ): { numBatches: number; numPerBatch: number } {
    const numIngredientsPerBatch = Math.ceil(totalNumIngredients / numBatches);
    const newNumPerBatch = Math.ceil(numPerBatch / numBatches);
    if (
      numIngredientsPerBatch >
      this.character.data.inventory_max_items * 0.9
    ) {
      numBatches += 1;
      return this.getTotalNumberOfIngredientsPerBatch(
        totalNumIngredients,
        numBatches,
        numPerBatch,
      );
    } else {
      logger.debug(
        `Found ${numBatches} batches with ${newNumPerBatch} items/${numIngredientsPerBatch} ingredients per batch`,
      );
    }
    return { numBatches: numBatches, numPerBatch: newNumPerBatch };
  }
}
