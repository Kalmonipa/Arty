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
import {
  CharacterFightResponseSchema,
  CharacterSchema,
  DestinationSchema,
  EquipSchema,
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
import { FightObjective } from './FightObjectiveClass';
import { EquipObjective } from './EquipObjectiveClass';
import { UnequipObjective } from './UnequipObjectiveClass';
import { WithdrawObjective } from './WithdrawObjectiveClass';
import { getResourceInformation } from '../api_calls/Resources';

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
  async craft(quantity: number, code: string) {
    const targetItem = await getItemInformation(code);

    if (targetItem instanceof ApiError) {
      logger.warn(
        `${targetItem.error.message} [Code: ${targetItem.error.code}]`,
      );
      if (targetItem.error.code === 499) {
        await sleep(this.data.cooldown, 'cooldown');
      }
      return true;
    }
    if (!targetItem.craft) {
      logger.warn(`Item has no craft information`);
      return true;
    }

    const maps = (await getMaps(targetItem.craft.skill, 'workshop')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps to craft ${code}`);
      return true;
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    logger.info(
      `Crafting ${quantity} ${code} at x: ${this.data.x}, y: ${this.data.y}`,
    );

    const response = await actionCraft(this.data, {
      code: code,
      quantity: quantity,
    });

    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = response.data.character;

      logger.info(`Successfully crafted ${quantity} ${code}`);
    }
  }

  /**
   * @description deposit the specified items into the bank
   */
  async deposit(quantity: number, itemCode: string) {
    logger.info(`Finding location of the bank`);

    const maps = (await getMaps(undefined, 'bank')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the bank. This shouldn't happen ??`);
      return false;
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    const response = await actionDepositItems(this.data, [
      { quantity: quantity, code: itemCode },
    ]);

    if (response instanceof ApiError) {
      if (response.error.code === 499) {
        logger.warn(`Character is in cooldown. [Code: ${response.error.code}]`);
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = response.data.character;
    }
    return true;
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
      var dist = Math.abs(this.data.x - map.x) + Math.abs(this.data.y - map.y);
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
      if (weaponDetails.effects) {
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
  }

  /**
   * @description equip the item
   */
  async equip(
    itemName: string,
    itemSlot: ItemSlot,
    quantity?: number,
  ): Promise<boolean> {
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
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = response.data.character;
    }
  }

  /**
   * @description equip the item
   */
  async unequip(itemSlot: ItemSlot, quantity?: number): Promise<boolean> {
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
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = response.data.character;
    }
  }

  /**
   * @description Fight the requested amount of mobs
   * @todo Does this function need to return anything?
   */
  async fight(quantity: number, code: string) {
    logger.info(`Finding location of ${code}`);

    const maps = (await getMaps(code)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${code}`);
      return true; // ToDo: Not sure if I want to return true, false or anything at all here
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    for (var count = 0; count < quantity; count++) {
      logger.info(`Fought ${count}/${quantity} ${code}s`);

      // Check inventory space to make sure we are less than 90% full
      await this.evaluateDepositItemsInBank();

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
          await sleep(this.data.cooldown, 'cooldown');
        }
        return true;
      } else {
        logger.info(
          `Fight was a ${response.data.fight.result}. Gained ${response.data.fight.xp} exp`,
        );

        this.data = response.data.character;
      }
    }

    logger.info(`Successfully fought ${quantity} ${code}`);

    return true;
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gather(quantity: number, code: string): Promise<boolean> {
    var numHeld = this.checkQuantityOfItemInInv(code);
    logger.info(`${numHeld} ${code} in inventory`);
    if (numHeld >= quantity) {
      logger.info(`There are already ${numHeld} in the inventory. Exiting`);
      return true;
    }
    const remainderToGather = quantity - numHeld;

    // Check our equipment to see if we can equip something useful
    var resourceDetails = await getItemInformation(code);
    if (resourceDetails instanceof ApiError) {
      logger.info(resourceDetails.message);
      await sleep(this.data.cooldown, 'cooldown');
    } else {
      if (!(await this.checkWeaponForEffects(resourceDetails.subtype))) {
        for (const item of this.data.inventory) {
          if (item.quantity > 0) {
            const itemInfo = await getItemInformation(item.code);
            if (itemInfo instanceof ApiError) {
              logger.warn(
                `${itemInfo.error.message} [Code: ${itemInfo.error.code}]`,
              );
            } else if (itemInfo.code === '') {
              logger.info(`No more items to check in inventory`);
            } else {
              for (const effect of itemInfo.effects) {
                if (effect.code === resourceDetails.subtype) {
                  await this.equip(item.code, 'weapon'); // ToDo: apparently this doesn't work
                }
              }
            }
          }
        }
        // ToDo:
        // - Search bank for suitable weapon. Can use /my/bank/items for this
        // - If no suitable weapon, maybe we just continue
        // - Extract this into it's own function?
      }
    }

    // Evaluate our inventory space before we start collecting items
    await this.evaluateDepositItemsInBank(code);

    logger.info(`Finding resource map type for ${code}`);

    const resources = await getResourceInformation({
      query: { drop: code },
      url: '/resources',
    });

    logger.info(`Finding location of ${resources.data[0].code}`);

    const maps = (await getMaps(resources.data[0].code)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${resources.data[0].code}`);
      return true;
    }

    const contentLocation = this.evaluateClosestMap(maps);

    await this.move({ x: contentLocation.x, y: contentLocation.y });

    await this.gatherItemLoop(
      { code: code, quantity: quantity },
      numHeld,
      remainderToGather,
      {
        x: contentLocation.x,
        y: contentLocation.y,
      },
    );

    numHeld = this.checkQuantityOfItemInInv(code);
    if (numHeld >= quantity) {
      logger.info(`Successfully gathered ${quantity} ${code}`);
      return true;
    }
    return false;
  }

  async gatherItemLoop(
    target: SimpleItemSchema,
    numHeld: number,
    remainderToGather: number,
    location: DestinationSchema,
  ) {
    // Loop that does the gather requests
    for (var count = 0; count < remainderToGather; count++) {
      if (count % 5 === 0) {
        numHeld = this.checkQuantityOfItemInInv(target.code);
        logger.info(`Gathered ${numHeld}/${target.quantity} ${target.code}`);
        // Check inventory space to make sure we are less than 90% full
        if (await this.evaluateDepositItemsInBank(target.code)) {
          // If items were deposited, we need to move back to the gathering location
          await this.move(location);
        }
      }

      const gatherResponse = await actionGather(this.data);

      if (gatherResponse instanceof ApiError) {
        logger.warn(
          `${gatherResponse.error.message} [Code: ${gatherResponse.error.code}]`,
        );
        if (gatherResponse.error.code === 499) {
          await sleep(this.data.cooldown, 'cooldown');
        }
      } else {
        this.data = gatherResponse.data.character;
      }
    }
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

  /**
   * @description if inventory if 90% full, we empty everything into the bank
   * ToDo:
   *  - Keep important items. Only deposit 'junk' that isn't part of our objective
   *     or useful items like potions, food, etc
   * @returns {boolean}
   *  - true means bank was visited and items deposited
   *  - false means nothing happened
   */
  async evaluateDepositItemsInBank(exception?: string): Promise<boolean> {
    let usedInventorySpace = this.getInventoryFullness();
    if (usedInventorySpace >= 90) {
      logger.warn(`Inventory is almost full. Depositing items`);
      const maps = (await getMaps(undefined, 'bank')).data;

      const contentLocation = this.evaluateClosestMap(maps);

      await this.move({ x: contentLocation.x, y: contentLocation.y });

      var itemsToDeposit: SimpleItemSchema[] = [];
      for (const item of this.data.inventory) {
        if (item.quantity === 0) {
          // If the item slot is empty we can ignore
          break;
        } else if (item.code === exception) {
          logger.info(`Not depositing ${exception} because we need it`);
        } else {
          logger.info(`Adding ${item.quantity} ${item.code} to deposit list`);
          itemsToDeposit.push({ code: item.code, quantity: item.quantity });
        }
      }

      const response = await actionDepositItems(this.data, itemsToDeposit);

      if (response instanceof ApiError) {
        if (response.error.code === 499) {
          logger.warn(
            `Character is in cooldown. [Code: ${response.error.code}]`,
          );
          await sleep(this.data.cooldown, 'cooldown');
        }
      } else {
        this.data = response.data.character;
      }
      return true;
    }
    return false;
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
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = moveResponse.data.character;
    }
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
        await sleep(this.data.cooldown, 'cooldown');
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
  async withdraw(quantity: number, itemCode: string) {
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
        await sleep(this.data.cooldown, 'cooldown');
      }
    } else {
      this.data = response.data.character;
    }
  }

  /********
   * Functions to add jobs to the job queue
   ********/

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craftJob(quantity: number, code: string) {
    this.addJob(
      new CraftObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description deposit the specified items into the bank
   */
  async depositJob(quantity: number, itemCode: string) {
    this.addJob(
      new DepositObjective(this, {
        code: itemCode,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description equip the item
   */
  async equipJob(itemName: string, itemSlot: ItemSlot, quantity?: number) {
    this.addJob(new EquipObjective(this, itemName, itemSlot, quantity));
  }

  /**
   * @description equip the item from the slot specified
   */
  async unequipJob(itemSlot: ItemSlot, quantity?: number) {
    this.addJob(new UnequipObjective(this, itemSlot, quantity));
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async fightJob(quantity: number, code: string) {
    this.addJob(new FightObjective(this, { code: code, quantity: quantity }));
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gatherJob(quantity: number, code: string) {
    this.addJob(
      new GatherObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdrawJob(quantity: number, itemCode: string) {
    this.addJob(new WithdrawObjective(this, itemCode, quantity));
  }
}
