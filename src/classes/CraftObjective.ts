import { actionCraft } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger } from '../utils';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { getItemInformation } from '../api_calls/Items';
import { ItemSchema, SimpleItemSchema } from '../types/types';

/**
 * @todo
 * - Empty inventory before starting, except for the item or any ingredients
 */
export class CraftObjective extends Objective {
  target: ObjectiveTargets;
  numBatches: number = 1;
  numItemsPerBatch: number;

  constructor(character: Character, target: ObjectiveTargets) {
    super(character, `craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    const quantyInInv = this.character.checkQuantityOfItemInInv(
      this.target.code,
    );

    if (quantyInInv <= this.target.quantity) {
      // If we're carrying some then we don't need to collect the full requested amount
      this.target.quantity = this.target.quantity - quantyInInv;
    }

    return true;
  }

  /**
   * @description Craft the item. Character will move to the correct workshop map
   */
  async run(): Promise<boolean> {
    if (this.target.quantity === 0) {
      logger.info(
        `Already have the requested amount of ${this.target.code}. Completing job`,
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
        // Build shopping list so that we can ensure we have enough inventory space to collect everything
        // If not enough inv space, split it into 2 jobs, craft half as much at once
        // If still not enough, keep splitting in half until we have enough inv space
        const batchInfo = this.calculateNumBatches(targetItem.craft.items);
        this.numBatches = batchInfo.numBatches;
        this.numItemsPerBatch = batchInfo.numPerBatch;

        if (!targetItem.craft) {
          logger.warn(`Item has no craft information`);
          return true;
        }

        const maps = (await getMaps(targetItem.craft.skill, 'workshop')).data;

        if (maps.length === 0) {
          logger.error(`Cannot find any maps to craft ${this.target.code}`);
          return true;
        }

        const contentLocation = this.character.evaluateClosestMap(maps);

        for (var batch = 0; batch < this.numBatches; batch++) {
          logger.debug(`Crafting batch ${batch}/${this.numBatches}`);

          await this.gatherIngredients(
            targetItem.craft.items,
            batchInfo.numPerBatch,
          );

          await this.character.move({
            x: contentLocation.x,
            y: contentLocation.y,
          });

          logger.info(
            `Crafting ${this.numItemsPerBatch} ${this.target.code} at x: ${this.character.data.x}, y: ${this.character.data.y}`,
          );

          const response = await actionCraft(this.character.data, {
            code: this.target.code,
            quantity: this.numItemsPerBatch,
          });

          if (response instanceof ApiError) {
            const shouldRetry = await this.character.handleErrors(response);

            if (!shouldRetry || attempt === this.maxRetries) {
              logger.error(`Craft failed after ${attempt} attempts`);
              return false;
            }
            continue;
          } else {
            this.character.data = response.data.character;

            if (this.numBatches > 1) {
              logger.debug(`Depositing items from batch ${batch}`);
              this.character.depositNow(
                this.numItemsPerBatch,
                this.target.code,
              );
            }

            logger.info(
              `Successfully crafted ${this.numItemsPerBatch} ${this.target.code}`,
            );
          }
        }
        if (this.numBatches > 1) {
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
  ) {
    for (const craftingItem of craftingItems) {
      logger.debug(
        `Collecting ${craftingItem.quantity * itemsPerBatch} ${craftingItem.code}`,
      );
      const craftingItemInfo: ItemSchema | ApiError = await getItemInformation(
        craftingItem.code,
      );

      if (craftingItemInfo instanceof ApiError) {
        await this.character.handleErrors(craftingItemInfo);
      } else {
        var numInInv = this.character.checkQuantityOfItemInInv(
          craftingItem.code,
        );

        const numInBank = await this.character.checkQuantityOfItemInBank(
          craftingItem.code,
        );

        const totalNumNeededToCraft = craftingItem.quantity * itemsPerBatch;

        if (numInInv >= totalNumNeededToCraft) {
          logger.info(
            `${numInInv} ${craftingItem.code} in inventory already. No need to collect more`,
          );
          continue;
        } else if (numInInv > 0) {
          logger.info(
            `${numInInv} ${craftingItem.code} in inventory already. Finding more`,
          );
        }
        if (numInBank >= totalNumNeededToCraft - numInInv) {
          logger.info(
            `Found ${numInBank} ${craftingItem.code} in the bank. Withdrawing ${totalNumNeededToCraft - numInInv}`,
          );
          await this.character.withdrawNow(
            totalNumNeededToCraft - numInInv,
            craftingItem.code,
          );
        }

        numInInv = this.character.checkQuantityOfItemInInv(craftingItem.code);

        if (numInInv < totalNumNeededToCraft) {
          if (craftingItemInfo.subtype === 'mob') {
            logger.debug(`Resource ${craftingItemInfo.code} is a mob drop`);

            await this.character.gatherNow(
              craftingItem.quantity - numInInv,
              craftingItem.code,
            );
          } else if (craftingItemInfo.craft !== null) {
            logger.debug(
              `Resource ${craftingItemInfo.code} is a craftable item`,
            );

            await this.character.craftNow(
              craftingItem.quantity - numInInv,
              craftingItem.code,
            );
          } else {
            // It must be a gather resource
            if (craftingItemInfo.craft) {
              logger.debug(
                `Resource ${craftingItem.code} is a gatherable item`,
              );

              await this.character.gatherNow(
                craftingItem.quantity - numInInv,
                craftingItem.code,
              );
            }
          }
        }
      }
    }
  }

  /**
   * @description Calculates how many batches we need to split the craft job into
   * Often we don't have enough inventory space to craft them all at once
   * @param craftList
   * @returns
   * - numBatches - The amount of batches to craft
   * - numPerBatch - The amount of items to craft per batch
   */
  private calculateNumBatches(craftList: SimpleItemSchema[]): {
    numBatches: number;
    numPerBatch: number;
  } {
    const numIngredients = this.getTotalNumberOfIngredients(craftList);
    // logger.debug(
    //   `Total number of ingredients needed to craft ${this.target.quantity} ${this.target.code}: ${numIngredients}`,
    // );
    // logger.debug(
    //   `Total number of inventory space available: ${this.character.data.inventory_max_items}`,
    // );

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
    var totalNumIngredients = 0;
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
    if (numIngredientsPerBatch > this.character.data.inventory_max_items) {
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
