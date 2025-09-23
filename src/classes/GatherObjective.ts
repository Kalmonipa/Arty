import { actionGather } from '../api_calls/Actions.js';
import { getItemInformation } from '../api_calls/Items.js';
import { getMaps } from '../api_calls/Maps.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getResourceInformation } from '../api_calls/Resources.js';
import { WeaponFlavours } from '../types/ItemData.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import {
  DataPageMonsterSchema,
  DestinationSchema,
  GatheringSkill,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class GatherObjective extends Objective {
  target: ObjectiveTargets;
  checkBank?: boolean;
  includeInventory?: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    checkBank?: boolean,
    includeInventory?: boolean,
  ) {
    super(character, `gather_${target.quantity}_${target.code}`, 'not_started');
    this.character = character;
    this.target = target;
    this.checkBank = checkBank;
    this.includeInventory = includeInventory;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * This method figures out how many we have in our inventory and in the bank
   * Then calls gather() to retrieve the remaining amount
   * @returns true if successful, false if failure
   */
  async run(): Promise<boolean> {
    let result = false;
    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);
    let numInBank = 0;

    // Sometimes we want to collect a bunch of the resource so we should skip checking the bank
    // Other times we want to gather stuff to then craft so taking from the bank is OK
    if (this.checkBank) {
      numInBank = await this.character.checkQuantityOfItemInBank(
        this.target.code,
      );
    }

    if (this.includeInventory && numInInv >= this.target.quantity) {
      logger.info(
        `${numInInv} ${this.target.code} in inventory already. No need to collect more`,
      );
      return true;
    } else if (numInBank >= this.target.quantity) {
      logger.info(
        `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${this.target.quantity}`,
      );
      return await this.character.withdrawNow(
        this.target.quantity,
        this.target.code,
      );
    } else if (numInBank > 0) {
      logger.info(
        `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${numInBank}`,
      );
    }

    if (this.includeInventory) {
      logger.info(`Including ${numInInv} from our inventory`);
      this.progress = numInInv;
    }

    result = await this.gather(
      this.target.quantity - this.progress,
      this.target.code,
    );

    return result;
  }

  async gather(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

      // Add the gathering item to the exclusion list
      if (!this.character.itemsToKeep.includes(code)) {
        this.character.itemsToKeep.push(code);
      }

      const numHeld = this.character.checkQuantityOfItemInInv(code);

      // Check our equipment to see if we can equip something useful
      const resourceDetails: ItemSchema | ApiError =
        await getItemInformation(code);
      if (resourceDetails instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(resourceDetails);

        if (!shouldRetry || attempt === maxRetries) {
          logger.error(`Gather failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        if (
          isGatheringSkill(resourceDetails.subtype) &&
          !(await this.character.checkWeaponForEffects(
            resourceDetails.subtype as GatheringSkill,
          ))
        ) {
          await this.character.equipBestWeapon(
            resourceDetails.subtype as WeaponFlavours,
          );
        }
      }

      // Evaluate our inventory space before we start collecting items
      // If the amount to gather is more than our inventory can handle we will drop off all items
      // If not, then we keep the target item
      const exceptions =
        this.target.quantity < this.character.data.inventory_max_items
          ? [code]
          : [];

      await this.character.evaluateDepositItemsInBank(exceptions, {
        x: this.character.data.x,
        y: this.character.data.y,
      });

      if (resourceDetails.subtype === 'mob') {
        return await this.gatherMobDrop({
          code: resourceDetails.code,
          quantity: quantity,
        });
      } else if (resourceDetails.craft) {
        await this.character.craftNow(quantity, resourceDetails.code);
      } else {
        return await this.gatherResource(code, quantity, numHeld);
      }
    }
    // Remove the gathered item if it's in the exclusion list
    if (this.character.itemsToKeep.includes(code)) {
      this.character.itemsToKeep.splice(
        this.character.itemsToKeep.indexOf(code),
        1,
      );
    }
  }

  async gatherItemLoop(
    target: SimpleItemSchema,
    location: DestinationSchema,
    exceptions?: string[],
  ): Promise<boolean> {
    // Loop that does the gather requests
    for (let count = 0; count < target.quantity; count++) {
      if (this.progress % 5 === 0) {
        logger.info(
          `Gathered ${this.progress}/${this.target.quantity} ${target.code}`,
        );
        // Check inventory space to make sure we are less than 90% full
        await this.character.evaluateDepositItemsInBank(exceptions, location);
      }

      const response = await actionGather(this.character.data);

      if (response instanceof ApiError) {
        await this.character.handleErrors(response);

        return false;
      } else {
        this.character.data = response.data.character;
        this.progress++; // ToDo There might be edge cases where this doesn't reflect the actual gathered number
      }

      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled.`);
        //this.character.removeJob(this.objectiveId);
        return false;
      }
    }
    return true;
  }

  async gatherMobDrop(target: SimpleItemSchema) {
    // ToDo: change this with new types in season-6-changes branch
    const mobInfo: DataPageMonsterSchema | ApiError =
      await getMonsterInformation({
        drop: target.code,
        max_level: this.character.data.level,
      });
    if (mobInfo instanceof ApiError) {
      return await this.character.handleErrors(mobInfo);
    } else {
      let numHeld = 0;

      // We want to compare total progress with the target quantity
      while (this.progress < target.quantity) {
        logger.info(
          `Gathered ${this.progress}/${this.target.quantity} ${this.target.code}`,
        );

        // ToDo: make this check all mobs in case multiple drop the item
        await this.character.fightNow(1, mobInfo.data[0].code);

        const newNumHeld = this.character.checkQuantityOfItemInInv(
          this.target.code,
        );
        if (newNumHeld > numHeld) {
          this.progress += newNumHeld - numHeld;
          numHeld = newNumHeld;
        }

        if (this.isCancelled()) {
          logger.info(`${this.objectiveId} has been cancelled.`);
          //this.character.removeJob(this.objectiveId);
          return false;
        }
      }
      return true;
    }
  }

  /**
   * gathers the requested resource
   * @param code
   * @param quantity
   * @param numHeld
   * @param remainderToGather
   * @returns true if
   */
  async gatherResource(
    code: string,
    quantity: number,
    numHeld: number,
    exceptions?: string[],
  ): Promise<boolean> {
    logger.debug(`Finding resource map type for ${code}`);

    const resources = await getResourceInformation({
      drop: code,
    });
    if (resources instanceof ApiError) {
      return this.character.handleErrors(resources);
    }

    logger.info(`Finding location of ${resources.data[0].code}`);

    const maps = await getMaps({ content_code: resources.data[0].code });
    if (maps instanceof ApiError) {
      return this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find any maps for ${resources.data[0].code}`);
      return false;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    await this.gatherItemLoop(
      { code: code, quantity: quantity },
      {
        x: contentLocation.x,
        y: contentLocation.y,
      },
      exceptions,
    );

    if (this.isCancelled()) {
      logger.info(`${this.objectiveId} has been cancelled.`);
      //this.character.removeJob(this.objectiveId);
      return false;
    }

    numHeld = this.character.checkQuantityOfItemInInv(code);
    if (this.progress >= quantity) {
      logger.info(`Successfully gathered ${quantity} ${code}`);
      return true;
    } else {
      logger.info(
        `Only gathered ${this.progress} ${code}. Collecting ${quantity - this.progress} more`,
      );
      await this.gatherItemLoop(
        { code: code, quantity: quantity - this.progress },
        {
          x: contentLocation.x,
          y: contentLocation.y,
        },
      );
      return true;
    }
  }
}
