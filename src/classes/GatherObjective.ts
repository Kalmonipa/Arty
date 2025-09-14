import { actionGather } from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { getMonsterInformation } from '../api_calls/Monsters';
import { getResourceInformation } from '../api_calls/Resources';
import { WeaponFlavours } from '../types/ItemData';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  DestinationSchema,
  GatheringSkill,
  GetAllMonstersMonstersGetResponse,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types';
import { isGatheringSkill, logger } from '../utils';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';

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

  async run(): Promise<boolean> {
    let result = false;
    let numInInv = this.character.checkQuantityOfItemInInv(this.target.code);
    let numInBank = 0;

    if (this.includeInventory) {
      logger.info(`Including ${numInInv} from our inventory`);
      this.progress = numInInv;
    }

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
      result = true;
    } else if (numInBank >= this.target.quantity) {
      logger.info(
        `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${this.target.quantity}`,
      );
      await this.character.withdrawNow(this.target.quantity, this.target.code);
    } else {
      result = await this.gather(
        this.target.quantity - this.progress,
        this.target.code,
      );
    }

    return result;
  }

  async gather(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

      var numHeld = this.character.checkQuantityOfItemInInv(code);
      if (numHeld >= quantity) {
        logger.info(`There are already ${numHeld} in the inventory. Exiting`);
        return true;
      }
      const remainderToGather = quantity - numHeld;

      // Check our equipment to see if we can equip something useful
      var resourceDetails: ItemSchema | ApiError =
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
        return await this.gatherMobDrop(
          { code: resourceDetails.code, quantity: quantity },
          numHeld,
        );
      } else if (resourceDetails.craft) {
        await this.character.craftNow(quantity, resourceDetails.code);
      } else {
        return await this.gatherResource(
          code,
          quantity,
          numHeld,
          remainderToGather,
        );
      }
    }
  }

  async gatherItemLoop(
    target: SimpleItemSchema,
    remainderToGather: number,
    location: DestinationSchema,
    exceptions?: string[],
  ): Promise<boolean> {
    // Loop that does the gather requests
    for (var count = 0; count < remainderToGather; count++) {
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
    }
    return true;
  }

  async gatherMobDrop(target: SimpleItemSchema, numHeld: number) {
    const mobInfo: GetAllMonstersMonstersGetResponse | ApiError =
      await getMonsterInformation({
        query: { drop: target.code, max_level: this.character.data.level },
        url: '/monsters',
      });
    if (mobInfo instanceof ApiError) {
      await this.character.handleErrors(mobInfo);
      return false;
    } else {
      const remainderToGather = target.quantity - numHeld;

      while (numHeld < remainderToGather) {
        logger.info(
          `Gathered ${numHeld}/${this.target.quantity} ${target.code}`,
        );

        // ToDo: make this check all mobs in case multiple drop the item
        await this.character.fightNow(1, mobInfo.data[0].code);

        const newNumHeld = this.character.checkQuantityOfItemInInv(target.code);
        if (newNumHeld > numHeld) {
          this.progress += newNumHeld - numHeld;
          numHeld = newNumHeld;
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
    remainderToGather: number,
    exceptions?: string[],
  ): Promise<boolean> {
    logger.debug(`Finding resource map type for ${code}`);

    const resources = await getResourceInformation({
      query: { drop: code },
      url: '/resources',
    });

    logger.info(`Finding location of ${resources.data[0].code}`);

    const maps = (await getMaps(resources.data[0].code)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${resources.data[0].code}`);
      return false;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    await this.gatherItemLoop(
      { code: code, quantity: quantity },
      remainderToGather,
      {
        x: contentLocation.x,
        y: contentLocation.y,
      },
      exceptions,
    );

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
        remainderToGather,
        {
          x: contentLocation.x,
          y: contentLocation.y,
        },
      );
    }
    return false;
  }
}
