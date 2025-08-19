import { actionCraft, actionGather, actionMove, actionRest } from "../api_calls/Actions";
import { HealthStatus } from "../types/CharacterData";
import {
  CharacterSchema,
  CraftingSchema,
  DestinationSchema,
  MapSchema,
  SimpleItemSchema,
} from "../types/types";
import { logger, sleep } from "../utils";
import { ApiError } from "./ErrorClass";

export class Character {
  data: CharacterSchema;

  constructor(data: CharacterSchema) {
    this.data = data;
    // Do something
  }

  /**
   * Returns the percentage of health we have and what is needed to get to 100%
   * @param character
   */
  checkHealth(): HealthStatus {
    return {
      percentage: (this.data.hp / this.data.max_hp) * 100,
      difference: this.data.max_hp - this.data.hp,
    };
  }

  /**
   * Checks if the character is in cooldown. Sleep until if finishes if yes
   * @param character
   * @returns {boolean}
   */
  cooldownStatus(): {
    inCooldown: boolean;
    timeRemaining: number;
  } {
    const timestamp = this.data.cooldown_expiration;

    const targetDate = new Date(timestamp);

    const now = new Date();

    if (now > targetDate) {
      return { inCooldown: false, timeRemaining: 0 };
    } else {
      const timeToWait =
        Math.floor((targetDate.getTime() - now.getTime()) / 1000) + 2;
      logger.info(
        `Cooldown is still ongoing. Waiting for ${timeToWait} seconds until ${timestamp}`,
      );
      return {
        inCooldown: true,
        timeRemaining: timeToWait,
      };
    }
  }

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craft(targetItem: CraftingSchema) {
    logger.info(`Crafting ${targetItem.quantity} ${targetItem.code} at x: ${this.data.x}, y: ${this.data.y}`);

    const craftResponse = await actionCraft(this.data.name, targetItem);

    if (craftResponse instanceof ApiError) {
      logger.warn(
        `${craftResponse.error.message} [Code: ${craftResponse.error.code}]`,
      );
      if (craftResponse.error.code === 499) {
        await sleep(5)
      }
      return true;
    }

    this.data = craftResponse.data.character;
  }

  /**
   * @description Finds the closest map based on manhattan distance from current location
   */
  evaluateClosestMap(maps: MapSchema[]): MapSchema {
    var closestDistance = 1000000;
    var closestMap: MapSchema;

    maps.forEach((map) => {
      var dist = this.data.x - map.x + (this.data.y - map.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestMap = map;
      }
    });

    logger.info(`Closest map is at x: ${closestMap.x}, y: ${closestMap.y}`);

    return closestMap;
  }

  /**
   * @description moves the character to the destination if they are not already there
   */
  async gather() {
    logger.info(`Gathering at x: ${this.data.x}, y: ${this.data.y}`);

    const gatherResponse = await actionGather(this.data.name);

    if (gatherResponse instanceof ApiError) {
      logger.warn(
        `${gatherResponse.error.message} [Code: ${gatherResponse.error.code}]`,
      );
      if (gatherResponse.error.code === 499) {
        await sleep(5)
      }
      return true;
    }

    this.data = gatherResponse.data.character;
  }

  /**
 * Returns what percentage of the backpack is full
 * @param char Character info to parse
 */
 getInventoryFullness(): number {
  var usedSpace = 0;
  this.data.inventory.forEach((invSlot) => {
    usedSpace += invSlot.quantity;
  });

  return Math.round((usedSpace / this.data.inventory_max_items) * 100);
}


  /**
   * @description moves the character to the destination if they are not already there
   */
  async move(destination: DestinationSchema) {

    if (this.data.x === destination.x && this.data.y === destination.y) {
      return;
    }

    logger.info(`Moving to x: ${destination.x}, y: ${destination.y}`);

    const moveResponse = await actionMove(this.data.name, {
      x: destination.x,
      y: destination.y,
    });

    if (moveResponse instanceof ApiError) {
      logger.warn(
        `${moveResponse.error.message} [Code: ${moveResponse.error.code}]`,
      );
      if (moveResponse.error.code === 499) {
        await sleep(5)
      }
      return true;
    }
    this.data = moveResponse.data.character;
  }
    /**
   * @description moves the character to the destination if they are not already there
   */
  async rest() {
    const restResponse = await actionRest(this.data.name);

    if (restResponse instanceof ApiError) {
      logger.warn(
        `${restResponse.error.message} [Code: ${restResponse.error.code}]`,
      );
      if (restResponse.error.code === 499) {
        await sleep(5)
      }
      return true;
    }

    logger.info(
      `Recovered ${restResponse.data.hp_restored} health`,
    );
    this.data = restResponse.data.character;
  }

}
