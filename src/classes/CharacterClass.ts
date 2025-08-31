import {
  actionDepositItems,
  actionMove,
  actionRest,
} from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import {
  BankItemTransactionResponseSchema,
  CharacterSchema,
  DestinationSchema,
  ItemSlot,
  MapSchema,
  SimpleItemSchema,
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
import { MonsterTaskObjective } from './MonsterTaskObjectiveClass';
import { getBankItems } from '../api_calls/Bank';

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
  appendJob(obj: Objective) {
    this.jobList.push(obj);
    logger.info(`Added to job list: ${obj.objectiveId}`);
  }

  /**
   * Adds an objective to the beginning of the job list
   */
  prependJob(obj: Objective) {
    this.jobList.unshift(obj);
    logger.info(`Added to beginning of job list: ${obj.objectiveId}`);
  }

  /**
   * Inserts an objective into the specified position in the array
   */
  insertJob(obj: Objective, index: number) {
    this.jobList.splice(index, 0, obj);
    logger.info(`Inserted ${obj.objectiveId} into position ${index}`);
  }

  /**
   * Remove job from jobList
   */
  removeJob(obj: Objective, index?: number) {
    if (!index) {
      index = this.jobList.indexOf(obj);
    }
    logger.debug(`Removing ${obj.objectiveId} from position ${index}`);
    const deletedObj = this.jobList.splice(index, 1);
    logger.info(`Removed ${deletedObj[0].objectiveId} from job queue`);
    if (this.jobList.length > 0) {
      logger.debug(`Current jobs in job queue`);
      for (const obj of this.jobList) {
        logger.debug(`   - ${obj.objectiveId} - ${obj.status}`);
      }
    }
  }

  /**
   * Executes all jobs in the job list
   */
  async executeJobList() {
    while (this.jobList.length > 0) {
      logger.info(`Executing job ${this.jobList[0].objectiveId}`);
      await this.jobList[0].execute(this);
    }

    logger.info(`No more jobs to execute`);
    // ToDo: Get character to do some idle tasks if nothing else to do
    return true;

    // for (const obj of this.jobList) {
    //   logger.info(`Executing job ${obj.objectiveId}`);
    //   await obj.execute(this);
    // }
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
   * @description Check bank for a specific item
   * @returns the amount found in the bank
   */
  async checkQuantityOfItemInBank(contentCode: string): Promise<number> {
    const bankItem = await getBankItems(contentCode);

    if (bankItem.total === 0) {
      return 0;
    } else if (bankItem.total === 1) {
      return bankItem.data[0].quantity;
    } else {
      var total = 0;
      for (const item of bankItem.data) {
        total += item.quantity;
      }
      return total;
    }
  }

  /**
   * Checks if the character is in cooldown. Sleep until if finishes if yes
   * @param character
   * @returns {boolean}
   */
  async cooldownStatus() {
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
      await sleep(timeToWait, 'cooldown');
    }
  }

  /**
   * @description Deposit all inventory items into bank
   */
  async depositAllItems() {
        this.prependJob(
      new DepositObjective(this, {
        code: 'all',
        quantity: 0,
      }),
    );
    await this.jobList[0].execute(this);
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
      if (weaponDetails.type === 'weapon' && typeOfActivity === 'mob') {
        isEffective = true;
      } else if (weaponDetails.effects) {
        for (const effect of weaponDetails.effects) {
          if (effect.code === typeOfActivity) {
            isEffective = true;
          }
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
        this.handleErrors(response);
        await this.evaluateDepositItemsInBank(exception);
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

  /********
   * Functions to add jobs to the job queue
   ********/

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craft(quantity: number, code: string) {
    this.appendJob(
      new CraftObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craftNow(quantity: number, code: string) {
    this.prependJob(
      new CraftObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
    await this.jobList[0].execute(this);
  }

  /**
   * @description Starts a monster task and fulfills it.
   * If a task is already in progress, it will continue with the current task
   * Turns it in the task master when complete
   */
  async fulfillMonsterTask() {
    this.appendJob(new MonsterTaskObjective(this));
  }

  /**
   * @description deposit the specified items into the bank
   */
  async deposit(quantity: number, itemCode: string) {
    this.appendJob(
      new DepositObjective(this, {
        code: itemCode,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description deposit the specified items into the bank
   */
  async depositNow(quantity: number, itemCode: string) {
    this.prependJob(
      new DepositObjective(this, {
        code: itemCode,
        quantity: quantity,
      }),
    );
    await this.jobList[0].execute(this);
  }

  /**
   * @description equip the item
   */
  async equip(itemName: string, itemSlot: ItemSlot, quantity?: number) {
    this.appendJob(new EquipObjective(this, itemName, itemSlot, quantity));
  }

  /**
   * @description equip the item now. Creates a new equip job at the
   * beginning of the job list and executes it
   */
  async equipNow(itemName: string, itemSlot: ItemSlot, quantity?: number) {
    this.prependJob(new EquipObjective(this, itemName, itemSlot, quantity));
    await this.jobList[0].execute(this);
  }

  /**
   * @description equip the item from the slot specified
   */
  async unequip(itemSlot: ItemSlot, quantity?: number) {
    this.appendJob(new UnequipObjective(this, itemSlot, quantity));
  }

  /**
   * @description equip the item from the slot specified
   */
  async unequipNow(itemSlot: ItemSlot, quantity?: number) {
    this.prependJob(new UnequipObjective(this, itemSlot, quantity));
    await this.jobList[0].execute(this);
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async fight(quantity: number, code: string) {
    this.appendJob(
      new FightObjective(this, { code: code, quantity: quantity }),
    );
  }

  /**
   * @description Creates a new fight objective at the beginning of the queue
   * and executes it
   */
  async fightNow(quantity: number, code: string) {
    this.prependJob(
      new FightObjective(this, { code: code, quantity: quantity }),
    );
    await this.jobList[0].execute(this);
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gather(quantity: number, code: string) {
    this.appendJob(
      new GatherObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gatherNow(quantity: number, code: string) {
    this.prependJob(
      new GatherObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
    await this.jobList[0].execute(this);
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdraw(quantity: number, itemCode: string) {
    this.appendJob(new WithdrawObjective(this, itemCode, quantity));
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdrawNow(quantity: number, itemCode: string) {
    this.prependJob(new WithdrawObjective(this, itemCode, quantity));
    await this.jobList[0].execute(this);
  }

  /**
   * @description handles the various errors that we may get back from API calls
   */
  async handleErrors(response: ApiError): Promise<boolean> {
    logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
    switch (response.error.code) {
      case 486:
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      case 497:
        await this.depositAllItems();
        return true;
      case 499:
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      default:
        return false;
    }
  }
}
