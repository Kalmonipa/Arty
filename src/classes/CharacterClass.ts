import {
  actionDepositItems,
  actionMove,
  actionRest,
} from '../api_calls/Actions';
import { actionUse, getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import {
  CharacterSchema,
  CraftSkill,
  DestinationSchema,
  GatheringSkill,
  ItemSchema,
  ItemSlot,
  MapSchema,
  SimpleItemSchema,
  Skill,
} from '../types/types';
import {
  buildListOf,
  buildListOfGatheringWeapons,
  logger,
  sleep,
} from '../utils';
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
import { ItemTaskObjective } from './ItemTaskObjectiveClass';
import { UtilityEffects } from '../types/ItemData';
import { SimpleMapSchema } from '../types/MapData';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjectiveClass';

export class Character {
  data: CharacterSchema;
  jobList: Objective[] = [];
  gatheringWeaponMap: Record<GatheringSkill, ItemSchema[]>;
  utilitiesMap: Record<string, ItemSchema[]>;
  consumablesMap: Record<string, ItemSchema[]>;

  /**
   * Max default number of slots. Can be increased with a backpack
   */
  maxInventorySlots = 20;

  /**
   * Maximum number of potions that can be equipped
   */
  maxEquippedUtilities = 100;
  /**
   * Minimum number of potions to equip
   */
  minEquippedUtilities = 20;

  /**
   * The code of the food we're currently using. Saving it as a var so
   * I don't have to search my inv to figure out what to use
   */
  preferredFood: string;
  /**
   * Desired number of food in inventory
   */
  desiredFoodCount = 50;
  /**
   *  Minimum food in inventory when going into a fight
   */
  minFood = 10;

  constructor(data: CharacterSchema) {
    this.data = data;
  }

  /**
   * @description function that builds some data sets to use later on
   */
  async init() {
    this.gatheringWeaponMap = await buildListOfGatheringWeapons();
    this.consumablesMap = await buildListOf('consumable');
    this.utilitiesMap = await buildListOf('utility');
  }

  /********
   * Job functions
   ********/

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
      await this.jobList[0].execute();
    }

    logger.info(`No more jobs to execute`);
    // ToDo: Get character to do some idle tasks if nothing else to do
    return true;
  }

  /********
   * Character detail functions
   ********/

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
   * @returns the amount found in inventory
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
   * @description gets the level of a specific skill. Returns the character level if no parameter passed in
   * @returns {number}
   */
  getCharacterLevel(skillName?: Skill): number {
    switch (skillName) {
      case 'alchemy':
        return this.data.alchemy_level;
      case 'cooking':
        return this.data.cooking_level;
      case 'fishing':
        return this.data.fishing_level;
      case 'gearcrafting':
        return this.data.gearcrafting_level;
      case 'jewelrycrafting':
        return this.data.jewelrycrafting_level;
      case 'mining':
        return this.data.mining_level;
      case 'weaponcrafting':
        return this.data.weaponcrafting_level;
      case 'woodcutting':
        return this.data.woodcutting_level;
      default:
        return this.data.level;
    }
  }

  /**
   * @description Check bank for a specific item
   * @returns the amount found in the bank
   */
  async checkQuantityOfItemInBank(contentCode: string): Promise<number> {
    const bankItem = await getBankItems(contentCode);
    if (bankItem instanceof ApiError) {
      this.handleErrors(bankItem);
    } else {
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
  }

  /**
   * Checks if the character is in cooldown. Sleep until if finishes if yes
   * @param character
   * @returns {boolean}
   * @todo I don't think this needs to return anything?
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
    await this.jobList[0].execute();
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
      if (
        weaponDetails.type === 'weapon' &&
        weaponDetails.subtype === '' &&
        typeOfActivity === 'mob'
      ) {
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

  async findBestWeaponForJob(typeOfActivity: GatheringSkill): Promise<string> {
    logger.debug(`Type of activity is ${typeOfActivity}`);
    const weapons = this.gatheringWeaponMap[typeOfActivity];
    logger.debug(`Found ${weapons?.length || 0} weapons for ${typeOfActivity}`);

    if (!weapons || weapons.length === 0) {
      logger.debug(`No weapons found for ${typeOfActivity}`);
      return;
    }

    this.gatheringWeaponMap[typeOfActivity].forEach((weapon) => {
      logger.debug(`${weapon.code}`);
    });
  }

  /**
   * @description Eat the required amount of preferred food to recover fully
   */
  async eatFood() {
    const healthStatus: HealthStatus = this.checkHealth();

    const preferredFoodInfo = this.consumablesMap.heal
      .find((food) => food.code === this.preferredFood)
      .effects.find((effect) => effect.code === 'heal').value;

    const amountNeededToEat = Math.ceil(
      healthStatus.difference / preferredFoodInfo,
    );

    logger.info(
      `Eating ${amountNeededToEat} ${this.preferredFood} to recover ${healthStatus.difference} health`,
    );

    const useResponse = await actionUse(this.data, {
      code: this.preferredFood,
      quantity: amountNeededToEat,
    });
    if (useResponse instanceof ApiError) {
      this.handleErrors(useResponse);
    } else {
      this.data = useResponse.data.character;
    }
  }

  /**
   * @description Equips a utility into the specified slot
   * Calculates how many potions we need to reach max number
   * Checks inventory and bank for the amount we need
   */
  async equipUtility(utilityType: UtilityEffects, slot: ItemSlot) {
    const utility = this.utilitiesMap[utilityType];
    for (var ind = utility.length - 1; ind >= 0; ind--) {
      if (utility[ind].level <= this.getCharacterLevel()) {
        if (slot === 'utility1') {
          var numNeeded =
            this.maxEquippedUtilities - this.data.utility1_slot_quantity;
        } else
          var numNeeded =
            this.maxEquippedUtilities - this.data.utility2_slot_quantity;

        const numInInv = this.checkQuantityOfItemInInv(utility[ind].code);
        logger.debug(`Attempting to equip ${utility[ind].name}`);
        if (numInInv >= numNeeded) {
          logger.debug(`Carrying ${numInInv} in inv. Equipping them`);
          await this.equipNow(utility[ind].code, slot, numInInv);
          return;
        } else if (numInInv > 0 && numInInv < numNeeded) {
          logger.debug(
            `Carrying ${numInInv} in inv. Equipping them and checking bank`,
          );
          await this.equipNow(utility[ind].code, slot, numInInv);
          numNeeded = numNeeded - numInInv;
          logger.debug(`${numNeeded} needed from the bank`);
        }
        const numInBank = await this.checkQuantityOfItemInBank(
          utility[ind].code,
        );
        if (numInBank > 0) {
          await this.withdrawNow(
            Math.min(numInBank, numNeeded),
            utility[ind].code,
          );
          await this.equipNow(
            utility[ind].code,
            slot,
            Math.min(numInBank, numNeeded),
          );
          return;
        } else {
          logger.debug(`Can't find any ${utility[ind].name}`);
        }
      }
    }
  }

  /**
   * @description Equips the best available item for the gathering task
   */
  async equipBestWeapon(gatheringType: GatheringSkill) {
    const weapons = this.gatheringWeaponMap[gatheringType];
    for (var ind = weapons.length - 1; ind >= 0; ind--) {
      if (weapons[ind].level <= this.getCharacterLevel(gatheringType)) {
        logger.debug(`Attempting to equip ${weapons[ind].name}`);
        if (this.checkQuantityOfItemInInv(weapons[ind].code) > 0) {
          await this.equipNow(weapons[ind].code, 'weapon');
          return;
        } else if (
          (await this.checkQuantityOfItemInBank(weapons[ind].code)) > 0
        ) {
          await this.withdrawNow(1, weapons[ind].code);
          await this.equipNow(weapons[ind].code, 'weapon');
          return;
        } else {
          logger.debug(`Can't find any ${weapons[ind].name}`);
        }
      }
    }
  }

  /**
   * @description top up the preferred food from the bank until we have the amount we want
   */
  async topUpFood() {
    const numNeeded =
      this.desiredFoodCount - this.checkQuantityOfItemInInv(this.preferredFood);

    await this.withdrawNow(numNeeded, this.preferredFood);
  }

  /********
   * Inventory functions
   ********/

  /**
   * @description if inventory if 90% full, we empty everything into the bank
   * @returns {boolean}
   *  - true means bank was visited and items deposited
   *  - false means nothing happened
   * @todo This should move back to the original location after depositing
   */
  async evaluateDepositItemsInBank(
    exceptions?: string[],
    priorLocation?: SimpleMapSchema,
  ): Promise<boolean> {
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
        } else if (exceptions.includes(item.code)) {
          logger.info(`Not depositing ${item.code} because we need it`);
        } else {
          logger.info(`Adding ${item.quantity} ${item.code} to deposit list`);
          itemsToDeposit.push({ code: item.code, quantity: item.quantity });
        }
      }

      const response = await actionDepositItems(this.data, itemsToDeposit);

      if (response instanceof ApiError) {
        this.handleErrors(response);
        await this.evaluateDepositItemsInBank(exceptions, priorLocation);
      } else {
        this.data = response.data.character;
        this.move(priorLocation);
      }
      return true;
    }
    return false;
  }

  /**
   * @returns what percentage of the backpack is full
   */
  getInventoryFullness(): number {
    var usedSpace = 0;
    this.data.inventory.forEach((invSlot) => {
      usedSpace += invSlot.quantity;
    });

    return Math.round((usedSpace / this.data.inventory_max_items) * 100);
  }

  /**
   * @description Checks inventory for the desired food and tops it up if we need too
   * Sets the preferred food if there isn't one already set
   * @todo Need to set a new preferredFood if we don't have any in inv or bank
   * @returns {boolean} stating whether we have a good amount of food or not
   */
  async checkFoodLevels(): Promise<boolean> {
    if (this.preferredFood) {
      logger.debug(`Preferred food is ${this.preferredFood}`);
      const amountCurrFood = this.checkQuantityOfItemInInv(this.preferredFood);
      if (amountCurrFood > this.minFood) {
        return true;
      } else {
        return false;
      }
    } else {
      logger.debug(`No preferred food. Finding one`);

      const foundItem = this.data.inventory.find((invItem) => {
        return this.consumablesMap.heal.find(
          (item) => invItem.code === item.code,
        );
      });

      if (foundItem) {
        logger.debug(
          `Found ${foundItem.quantity} ${foundItem.code} in inventory. Setting it as the preferred food`,
        );
        this.preferredFood = foundItem.code;

        if (foundItem.quantity <= this.minFood) {
          return false;
        } else {
          return true;
        }
      }
      logger.debug(`No food in inventory. Checking bank to find some`);
      const bankItems = await getBankItems();
      if (bankItems instanceof ApiError) {
        this.handleErrors(bankItems);
      } else {
        const foundItem = bankItems.data.find((bankItem) => {
          return this.consumablesMap.heal.find(
            (item) => bankItem.code === item.code,
          );
        });

        if (foundItem) {
          logger.debug(
            `Found ${foundItem.code} in the bank. Setting it as the preferred food`,
          );
          this.preferredFood = foundItem.code;
        }
      }
    }
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
      this.handleErrors(moveResponse);
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
      this.handleErrors(restResponse);
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
    await this.jobList[0].execute();
  }

  /**
   * @description Starts an items task and fulfills it.
   * If a task is not in progress, will start a new one
   * Hands in items as they are gathered
   */
  async doItemsTask() {
    this.appendJob(new ItemTaskObjective(this));
  }

  /**
   * @description Starts a monster task and fulfills it.
   * If a task is already in progress, it will continue with the current task
   * Turns it in the task master when complete
   */
  async doMonsterTask() {
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
    await this.jobList[0].execute();
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
    await this.jobList[0].execute();
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
    await this.jobList[0].execute();
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
    await this.jobList[0].execute();
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gather(quantity: number, code: string, checkBank?: boolean) {
    this.appendJob(
      new GatherObjective(
        this,
        {
          code: code,
          quantity: quantity,
        },
        checkBank,
      ),
    );
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gatherNow(quantity: number, code: string, checkBank?: boolean) {
    this.prependJob(
      new GatherObjective(
        this,
        {
          code: code,
          quantity: quantity,
        },
        checkBank,
      ),
    );
    await this.jobList[0].execute();
  }

  /**
   * @description levels the specified craft skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async levelCraftingSkill(targetSkill: CraftSkill, targetLevel: number) {
    logger.warn(`Levelling craft skills isn't implemented yet`);
  }

  /**
   * @description levels the specified gathering skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async levelGatheringSkill(targetSkill: GatheringSkill, targetLevel: number) {
    this.appendJob(
      new TrainGatheringSkillObjective(this, targetSkill, targetLevel),
    );
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
    await this.jobList[0].execute();
  }

  /**
   * @description handles the various errors that we may get back from API calls
   * @returns a boolean stating whether we should retry or not
   */
  async handleErrors(response: ApiError): Promise<boolean> {
    if (response.error.message) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
    }
    switch (response.error.code) {
      case 404: // Code not found
        return false;
      case 422: // Invalid payload
        logger.error(`Invalid payload [Code: ${response.error.code}]`);
        return false;
      case 484: // The character cannot equip more than 100 utilities in the same slot.
        // ToDo: maybe do something here? Only equip enough to reach 100?
        return false;
      case 486: // An action is already in progress for this character.
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      case 488: // Character has not completed the task. Should not retry completing task
        return false;
      case 497: // The character's inventory is full.
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
