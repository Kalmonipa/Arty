import { actionCraft } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { getItemInformation } from '../api_calls/Items';
import { GatherObjective } from './GatherObjectiveClass';
import { ItemSchema } from '../types/types';

export class CraftObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(character, `craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.startJob();

    await this.runSharedPrereqChecks();
    await this.runPrerequisiteChecks();

    const result = await this.craft(this.target.quantity, this.target.code);

    this.completeJob(result);
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {
    logger.debug(`Checking item schema of ${this.target.code}`);
    const response: ItemSchema | ApiError = await getItemInformation(
      this.target.code,
    );

    if (response instanceof ApiError) {
      this.character.handleErrors(response);
    } else if (response.craft) {
      for (const craftingItem of response.craft.items) {
        logger.debug(`Checking ${craftingItem.code}`);
        const craftingItemInfo: ItemSchema | ApiError =
          await getItemInformation(craftingItem.code);

        if (craftingItemInfo instanceof ApiError) {
          await this.character.handleErrors(craftingItemInfo);
        } else {
          var numInInv = this.character.checkQuantityOfItemInInv(
            craftingItem.code,
          );

          const numInBank = await this.character.checkQuantityOfItemInBank(
            craftingItem.code,
          );

          const totalNumNeededToCraft =
            craftingItem.quantity * this.target.quantity;

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
              if (response.craft) {
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
    } else {
      logger.info(`No craft items`);
    }
  }

  /**
   * @description Craft the item. Character will move to the correct workshop map
   */
  async craft(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Craft attempt ${attempt}/${maxRetries}`);

      const targetItem = await getItemInformation(code);

      if (targetItem instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(targetItem);

        if (!shouldRetry || attempt === maxRetries) {
          logger.error(`Craft failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        if (!targetItem.craft) {
          logger.warn(`Item has no craft information`);
          return true;
        }

        const maps = (await getMaps(targetItem.craft.skill, 'workshop')).data;

        if (maps.length === 0) {
          logger.error(`Cannot find any maps to craft ${code}`);
          return true;
        }

        const contentLocation = this.character.evaluateClosestMap(maps);

        await this.character.move({
          x: contentLocation.x,
          y: contentLocation.y,
        });

        logger.info(
          `Crafting ${quantity} ${code} at x: ${this.character.data.x}, y: ${this.character.data.y}`,
        );

        const response = await actionCraft(this.character.data, {
          code: code,
          quantity: quantity,
        });

        if (response instanceof ApiError) {
          const shouldRetry = await this.character.handleErrors(response);

          if (!shouldRetry || attempt === maxRetries) {
            logger.error(`Gather failed after ${attempt} attempts`);
            return false;
          }
          continue;
        } else {
          this.character.data = response.data.character;

          logger.info(`Successfully crafted ${quantity} ${code}`);
          return true;
        }
      }
    }

    return false;
  }
}
