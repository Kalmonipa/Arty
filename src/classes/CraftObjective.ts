import { actionCraft } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getItemInformation } from '../api_calls/Items.js';
import { ItemSchema, SimpleItemSchema } from '../types/types.js';

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
        if (this.isCancelled()) {
          logger.info(`${this.objectiveId} has been cancelled`);
          return false;
        }
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

        const maps = await getMaps({
          content_code: targetItem.craft.skill,
          content_type: 'workshop',
        });
        if (maps instanceof ApiError) {
          return this.character.handleErrors(maps);
        }

        if (maps.data.length === 0) {
          logger.error(`Cannot find any maps to craft ${this.target.code}`);
          return true;
        }

        const contentLocation = this.character.evaluateClosestMap(maps.data);

        for (let batch = 0; batch < this.numBatches; batch++) {
          logger.debug(`Crafting batch ${batch}/${this.numBatches}`);

          if (this.isCancelled()) {
            logger.info(`${this.objectiveId} has been cancelled`);
            //this.character.removeJob(this.objectiveId);
            return false;
          }

          await this.gatherIngredients(
            targetItem.craft.items,
            batchInfo.numPerBatch,
          );

          if (this.isCancelled()) {
            logger.info(`${this.objectiveId} has been cancelled`);
            return false;
          }

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
            if (response.data.character) {
              this.character.data = response.data.character;
            } else {
              logger.error('Craft response missing character data');
            }

            if (this.numBatches > 1) {
              logger.debug(`Depositing items from batch ${batch}`);
              await this.character.depositNow(
                this.numItemsPerBatch,
                this.target.code,
              );
            }

            logger.info(
              `Successfully crafted ${this.numItemsPerBatch} ${this.target.code}`,
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
  ) {
    for (const craftingItem of craftingItems) {
      logger.debug(
        `Collecting ${craftingItem.quantity * itemsPerBatch} ${craftingItem.code}`,
      );
      // ToDo: get the items to keep thing to work properly
      //logger.debug(`Adding ${craftingItem.code} to exceptions list`)
      //this.character.itemsToKeep.push(craftingItem.code)

      const craftingItemInfo: ItemSchema | ApiError = await getItemInformation(
        craftingItem.code,
      );

      if (craftingItemInfo instanceof ApiError) {
        await this.character.handleErrors(craftingItemInfo);
      } else {
        let numInInv = this.character.checkQuantityOfItemInInv(
          craftingItem.code,
        );

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
          if (this.isCancelled()) {
            logger.info(`${this.objectiveId} has been cancelled`);
            //this.character.removeJob(this.objectiveId);
            return false;
          }

          if (craftingItemInfo.subtype === 'mob') {
            logger.debug(`Resource ${craftingItemInfo.code} is a mob drop`);

            await this.character.gatherNow(
              totalIngredNeededToCraft - numInInv,
              craftingItem.code,
              true,
              false,
            );

            if (this.isCancelled()) {
              logger.info(`${this.objectiveId} has been cancelled`);
              return false;
            }
          } else if (craftingItemInfo.craft !== null) {
            logger.debug(
              `Resource ${craftingItemInfo.code} is a craftable item`,
            );

            await this.character.craftNow(
              totalIngredNeededToCraft - numInInv,
              craftingItem.code,
            );

            if (this.isCancelled()) {
              logger.info(`${this.objectiveId} has been cancelled`);
              return false;
            }
          } else {
            logger.debug(`Resource ${craftingItem.code} is a gatherable item`);

            // We don't want to include what's in our inventory. We want to collect new
            await this.character.gatherNow(
              totalIngredNeededToCraft - numInInv,
              craftingItem.code,
              true,
              false,
            );

            if (this.isCancelled()) {
              logger.info(`${this.objectiveId} has been cancelled`);
              return false;
            }
          }
        }

        this.character.removeItemFromItemsToKeep(craftingItem.code);

        // Ensure that we're carrying the correct amount of ingredients. They may have been deposited into bank
        numInInv = this.character.checkQuantityOfItemInInv(craftingItem.code);
        numInBank = await this.character.checkQuantityOfItemInBank(
          craftingItem.code,
        );
        if (
          numInInv < totalIngredNeededToCraft &&
          numInBank >= totalIngredNeededToCraft - numInInv
        ) {
          await this.character.withdrawNow(
            totalIngredNeededToCraft - numInInv,
            craftingItem.code,
          );
        } else {
          logger.info(
            `Need ${totalIngredNeededToCraft} but only carrying ${numInInv} and ${numInBank} in the bank`,
          );
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
