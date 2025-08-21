import { it } from 'node:test';
import {
  actionCraft,
  actionDepositItems,
  actionFight,
  actionGather,
  actionMove,
  actionRest,
  actionWithdrawItem,
} from '../api_calls/Actions';
import {
  actionEquipItem,
  actionUnequipItem,
  getItemInformation,
} from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  CharacterSchema,
  CraftingSchema,
  DestinationSchema,
  EquipSchema,
  ItemSchema,
  ItemSlot,
  MapSchema,
  SimpleItemSchema,
  UnequipSchema,
} from '../types/types';
import { logger, sleep } from '../utils';
import { CraftObjective } from './CraftObjectiveClass';
import { DepositObjective } from './DepositObjectiveClass';
import { ApiError } from './ErrorClass';
import { GatherObjective } from './GatherObjectiveClass';
import { Objective } from './ObjectiveClass';

export class Character {
  data: CharacterSchema;
  jobList: Objective[] = [];

  // Max default number of slots. Can be increased with a backpack
  maxInventorySlots = 20;

  constructor(data: CharacterSchema) {
    this.data = data;
  }

  /**
   * Adds an objective to the end of the job list
   * @param obj
   */
  addJob(obj: Objective) {
    this.jobList.push(obj);
    logger.info(`Added to job list: ${obj.objectiveId}`);
  }

  /**
   * Executes all jobs in the job list
   */
  async executeJobList() {
    for (const obj of this.jobList) {
      logger.info(`Executing job ${obj.objectiveId}`);
      await obj.execute(this);
    }
    return true;
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
   * @description Check inventory for a specific item
   */
  checkQuantityOfItemInInv(contentCode: string): number {
    const foundItem = this.data.inventory.find(
      (item) => item.code === contentCode,
    );
    if (foundItem) {
      return foundItem.quantity;
    } else {
      return 0;
    }
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
    const targetDate = new Date(this.data.cooldown_expiration);

    const now = new Date();

    if (now > targetDate) {
      return { inCooldown: false, timeRemaining: 0 };
    } else {
      const timeToWait =
        Math.floor((targetDate.getTime() - now.getTime()) / 1000) + 2; // Arbitrarily adding 2 secconds here
      logger.info(
        `Cooldown is still ongoing. Waiting for ${timeToWait} seconds until ${this.data.cooldown_expiration}`,
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
  craft(quantity: number, code: string) {
    this.addJob(
      new CraftObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async deposit(quantity: number, itemCode: string) {
    this.addJob(
      new DepositObjective(this, {
        code: itemCode,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description Finds the closest map based on manhattan distance from current location
   */
  evaluateClosestMap(maps: MapSchema[]): MapSchema {
    var closestDistance = 1000000;
    var closestMap: MapSchema;

    if (maps.length === 0) {
      return;
    }

    maps.forEach((map) => {
      var dist = this.data.x - map.x + (this.data.y - map.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestMap = map;
      }
    });

    if (this.data.x !== closestMap.x && this.data.y !== closestMap.y) {
      logger.info(`Closest map is at x: ${closestMap.x}, y: ${closestMap.y}`);
    }

    return closestMap;
  }

  /********
   * Item functions
   ********/

  /**
   * Check currently equipped weapon
   * @returns {boolean}
   *  - true means the currently equipped weapon is beneficial for the activity
   *  - false means it is not beneficial
   */
  async checkWeaponForEffects(typeOfActivity: string): Promise<boolean> {
    var isEffective: boolean = false;
    var weaponDetails = await getItemInformation(this.data.weapon_slot);
    if (weaponDetails instanceof ApiError) {
      logger.info(weaponDetails.message);
      return false;
    } else {
      for (const effect of weaponDetails.effects) {
        if (effect.code === typeOfActivity) {
          isEffective = true;
        }
      }
      if (isEffective) {
        logger.info(`Current weapon is suitable for ${typeOfActivity}`);
        return true;
      } else {
        logger.info(`Current weapon is NOT suitable for ${typeOfActivity}`);
        return false;
      }
    }
  }

  /**
   * @description equip the item
   */
  async equip(itemName: string, itemSlot: ItemSlot, quantity?: number) {
    if (!quantity) quantity = 1;

    if (
      (itemSlot === 'utility1' || itemSlot === 'utility2') &&
      quantity > 100
    ) {
      logger.warn(
        `Quantity can only be provided for utility slots and must be less than 100`,
      );
      return;
    }

    logger.info(`Equipping ${quantity} ${itemName} into ${itemSlot}`);

    const equipSchema: EquipSchema = {
      code: itemName,
      slot: itemSlot,
      quantity: quantity,
    };

    const response = await actionEquipItem(this.data, equipSchema);
    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(5);
      }
    } else {
      this.data = response.data.character;
    }
  }

  /**
   * @description equip the item
   */
  async unequip(itemSlot: ItemSlot, quantity?: number) {
    if (!quantity) quantity = 1;

    // validations
    if (
      (itemSlot === 'utility1' || itemSlot === 'utility2') &&
      quantity > 100
    ) {
      logger.warn(
        `Quantity can only be provided for utility slots and must be less than 100`,
      );
      return;
    }

    logger.info(`Unequipping ${itemSlot} slot`);

    const unequipSchema: UnequipSchema = {
      slot: itemSlot,
      quantity: quantity,
    };

    const response = await actionUnequipItem(this.data, unequipSchema);
    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(5);
      }
    } else {
      this.data = response.data.character;
    }
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async fight(targetNumber: number, contentCode: string): Promise<boolean> {
    logger.info(`Finding location of ${contentCode}`);

    const maps = (await getMaps(contentCode)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${contentCode}`);
      return true;
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    for (var count = 0; count < targetNumber; count++) {
      logger.info(`Fought ${count}/${targetNumber} ${contentCode}s`);
      const healthStatus: HealthStatus = this.checkHealth();

      if (healthStatus.percentage !== 100) {
        if (healthStatus.difference < 300) {
          await this.rest();
        } //else {
        // Eat food
        //}
      }

      const response = await actionFight(this.data);

      if (response instanceof ApiError) {
        logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
        if (response.error.code === 499) {
          await sleep(5);
        }
        return true;
      }

      this.data = response.data.character;
    }

    logger.info(`Successfully fought ${targetNumber} ${contentCode}s`);

    return true;
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gather(quantity: number, code: string) {
    this.addJob(
      new GatherObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /********
   * Inventory functions
   ********/

  /**
   * @description Check inventory for specific item
   */
  checkInventoryForItemType() {
    for (const item of this.data.inventory) {
      if (item) {
      }
    }
  }

  async evaluateDepositItemsInBank() {
    let usedInventorySpace = this.getInventoryFullness();
    if (usedInventorySpace >= 90) {
      logger.warn(`Inventory is almost full. Depositing items`);
      const maps = (await getMaps(undefined, 'bank')).data;

      const contentLocation = this.evaluateClosestMap(maps);

      await this.move({ x: contentLocation.x, y: contentLocation.y });

      var itemsToDepost: SimpleItemSchema[];
      for (const item of this.data.inventory) {
        itemsToDepost.push({ code: item.code, quantity: item.quantity });
      }

      const response = await actionDepositItems(this.data, itemsToDepost);

      if (response instanceof ApiError) {
        if (response.error.code === 499) {
          logger.warn(
            `Character is in cooldown. [Code: ${response.error.code}]`,
          );
          await sleep(5);
        }
      } else {
        this.data = response.data.character;
      }
    }
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

    const moveResponse = await actionMove(this.data, {
      x: destination.x,
      y: destination.y,
    });

    if (moveResponse instanceof ApiError) {
      logger.warn(
        `${moveResponse.error.message} [Code: ${moveResponse.error.code}]`,
      );
      if (moveResponse.error.code === 499) {
        await sleep(5);
      }
      return true;
    }
    this.data = moveResponse.data.character;
  }

  /**
   * @description moves the character to the destination if they are not already there
   */
  async rest() {
    const restResponse = await actionRest(this.data);

    if (restResponse instanceof ApiError) {
      logger.warn(
        `${restResponse.error.message} [Code: ${restResponse.error.code}]`,
      );
      if (restResponse.error.code === 499) {
        await sleep(5);
      }
    } else {
      logger.info(
        `Recovered ${restResponse.data.hp_restored} health from resting`,
      );
      this.data = restResponse.data.character;
    }
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdraw(quantity: number, itemCode: string): Promise<boolean> {
    logger.info(`Finding location of the bank`);

    const maps = (await getMaps(undefined, 'bank')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the bank. This shouldn't happen ??`);
      return true;
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    const response = await actionWithdrawItem(this.data, [
      { quantity: quantity, code: itemCode },
    ]);

    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(5);
      }
    } else {
      this.data = response.data.character;
    }
    return true;
  }
}
