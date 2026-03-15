import { actionGather } from '../api_calls/Actions.js';
import { getItemInformation } from '../api_calls/Items.js';
import { getMaps } from '../api_calls/Maps.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { WeaponFlavours } from '../types/ItemData.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import {
  StaticDataPageMonsterSchema,
  ItemSchema,
  MapSchema,
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
    this.jobFlavour = 'Gather';
    this.target = target;
    this.checkBank = checkBank;
    this.includeInventory =
      includeInventory !== undefined ? includeInventory : true;
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
    if (!(await this.checkStatus())) return false;

    let numInInv = 0;
    let numInBank = 0;
    this.progress = 0;

    if (this.target.code === 'wooden_stick') {
      logger.info(`${this.target.code} is not gatherable`);
      return false;
    }

    if (this.includeInventory) {
      numInInv = this.character.checkQuantityOfItemInInv(this.target.code);
    }
    // Sometimes we want to collect a bunch of the resource so we should skip checking the bank
    // Other times we want to gather stuff to then craft so taking from the bank is OK
    if (this.checkBank) {
      numInBank = await this.character.checkQuantityOfItemInBank(
        this.target.code,
      );
    }

    // Calculate total available items
    const totalAvailable = numInInv + numInBank;

    // If we already have enough, we're done
    if (totalAvailable >= this.target.quantity) {
      if (this.includeInventory && numInInv >= this.target.quantity) {
        logger.info(
          `${numInInv} ${this.target.code} in inventory already. No need to collect more`,
        );
        return true;
      } else {
        // Need to withdraw from bank
        const needToWithdraw = Math.max(this.target.quantity - numInInv, 0);
        logger.info(
          `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${needToWithdraw}`,
        );
        return await this.character.withdrawNow(
          needToWithdraw,
          this.target.code,
        );
      }
    }

    // Withdraw what we can from bank first
    if (numInBank > 0) {
      logger.info(
        `Withdrawing ${numInBank} ${this.target.code} from the bank. Need to gather ${this.target.quantity - numInBank - numInInv} more`,
      );
      await this.character.withdrawNow(numInBank, this.target.code);
    }

    // Calculate how many we still need to gather
    const currentTotal = this.character.checkQuantityOfItemInInv(
      this.target.code,
    );
    const stillNeeded = this.target.quantity - currentTotal;

    if (stillNeeded <= 0) {
      logger.info(
        `Already have enough ${this.target.code} after bank withdrawal`,
      );
      return true;
    }

    logger.info(`Need to gather ${stillNeeded} more ${this.target.code}`);

    return await this.gather(stillNeeded, this.target.code);
  }

  /**
   * @description Holds the logic for finding the resource map and gathering the resource
   * @param quantity target number to gather
   * @param code item code of the resource to gather
   * @param maxRetries number of retries before failing the job. Defaults to 3
   * @returns true if successful, false if not
   */
  async gather(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

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
        if (isGatheringSkill(resourceDetails.subtype)) {
          await this.character.evaluateGear(
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

      await this.character.evaluateDepositItemsInBank(exceptions);

      if (resourceDetails.subtype === 'mob') {
        if (
          !(await this.gatherMobDrop({
            code: resourceDetails.code,
            quantity: quantity,
          }))
        ) {
          attempt++;
          continue;
        } else {
          return true;
        }
      } else if (
        resourceDetails.subtype === 'task' ||
        resourceDetails.subtype === 'npc'
      ) {
        if (
          !(await this.character.tradeWithNpcNow(
            'buy',
            quantity,
            resourceDetails.code,
          ))
        ) {
          attempt++;
          continue;
        } else {
          return true;
        }
      } else if (resourceDetails.craft && resourceDetails.code !== 'sap') {
        if (!(await this.character.craftNow(quantity, resourceDetails.code))) {
          attempt++;
          continue;
        } else {
          return true;
        }
      } else {
        if (!(await this.gatherResource(code, quantity))) {
          attempt++;
          continue;
        } else {
          return true;
        }
      }
    }
  }

  async gatherItemLoop(
    target: SimpleItemSchema,
    location: MapSchema,
    exceptions?: string[],
  ): Promise<boolean> {
    // Loop that does the gather requests
    while (this.progress < target.quantity) {
      if (this.progress % 5 === 0) {
        logger.info(
          `Gathered ${this.progress}/${target.quantity} ${target.code}`,
        );
        // Check inventory space to make sure we are less than 90% full
        await this.character.evaluateDepositItemsInBank(exceptions, location);

        // Check this during gathering jobs so we don't miss out
        if (this.character.enableEvents) {
          await this.character.checkForActiveEvents();
        }
      }

      const response = await actionGather(this.character.data);

      if (response instanceof ApiError) {
        await this.character.handleErrors(response);
        return false;
      } else {
        if (response && response.data && response.data.character) {
          this.character.data = response.data.character;
          if (
            response.data.details.items.find(
              (item) => item.code === target.code,
            )
          ) {
            this.progress++;
          }
        } else {
          logger.error(
            'Invalid response structure from actionGather:',
            response,
          );
          return false;
        }
      }

      if (!(await this.checkStatus())) return false;

      await this.character.saveJobQueue();
    }

    return true;
  }

  async gatherMobDrop(target: SimpleItemSchema) {
    const mobInfo: StaticDataPageMonsterSchema | ApiError =
      await getAllMonsterInformation({
        drop: target.code,
        max_level: this.character.data.level,
      });
    if (mobInfo instanceof ApiError) {
      return await this.character.handleErrors(mobInfo);
    } else if (mobInfo.data.length === 0) {
      logger.error(`Found no mobs for drop ${target.code}`);
      return false;
    } else {
      let numHeld = this.character.checkQuantityOfItemInInv(this.target.code);

      // We want to compare total progress with the target quantity
      while (this.progress < target.quantity) {
        logger.info(
          `Gathered ${this.progress}/${this.target.quantity} ${this.target.code}`,
        );

        logger.info(`Mob info for ${mobInfo.data.length} mobs`);

        // ToDo: make this check all mobs in case multiple drop the item
        if (!(await this.character.fightNow(10, mobInfo.data[0].code))) {
          logger.debug(`Fight attempt against ${mobInfo.data[0].code} failed`);
          return false;
        }

        const newNumHeld = this.character.checkQuantityOfItemInInv(
          this.target.code,
        );
        if (newNumHeld > numHeld) {
          this.progress += newNumHeld - numHeld;
          numHeld = newNumHeld;
        }

        if (!(await this.checkStatus())) return false;

        await this.character.saveJobQueue();
      }
      return true;
    }
  }

  /**
   * gathers the requested resource
   * @param code item code to gather
   * @param quantity number of items to gather
   * @param exceptions items to keep in inventory
   * @returns true if successful, false if not
   */
  async gatherResource(
    code: string,
    quantity: number,
    exceptions?: string[],
  ): Promise<boolean> {
    logger.debug(`Finding resource map type for ${code}`);

    const resources = await getAllResourceInformation({
      drop: code,
    });
    if (resources instanceof ApiError) {
      return this.character.handleErrors(resources);
    }

    logger.debug(`Finding best resource to gather`);
    const resource = (() => {
      for (let i = resources.data.length - 1; i >= 0; i--) {
        const res = resources.data[i];
        if (
          res.level <=
          this.character.getCharacterLevel(this.character.data, res.skill)
        ) {
          return res;
        }
      }
      logger.warn(
        `${this.character.data.name} level is not high enough to gather ${code}`,
      );
      return undefined;
    })();

    if (!resource) {
      return false;
    }

    logger.info(`Finding location of ${resource.code}`);

    const maps = await getMaps({ content_code: resource.code });
    if (maps instanceof ApiError) {
      return this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find any maps for ${resource.code}`);
      return false;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);
    await this.character.move(contentLocation);

    const success = await this.gatherItemLoop(
      { code: code, quantity: quantity },
      contentLocation,
      exceptions,
    );

    if (!(await this.checkStatus())) return false;

    if (this.progress >= quantity) {
      logger.info(`Successfully gathered ${this.progress} ${code}`);
      return true;
    } else {
      logger.warn(
        `Only gathered ${this.progress}/${quantity} ${code}. We should gather more`,
      );
      return success; // Return the result from gatherItemLoop
    }
  }
}
