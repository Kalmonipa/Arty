import { actionGather } from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { getMonsterInformation } from '../api_calls/Monsters';
import { getResourceInformation } from '../api_calls/Resources';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  DestinationSchema,
  GatheringSkill,
  GetAllMonstersMonstersGetResponse,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types';
import { isGatheringSkill, logger } from '../utils';
import { Character } from './CharacterClass';
import { CraftObjective } from './CraftObjectiveClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class GatherObjective extends Objective {
  target: ObjectiveTargets;
  checkBank?: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    checkBank?: boolean,
  ) {
    super(character, `gather_${target.quantity}_${target.code}`, 'not_started');
    this.character = character;
    this.target = target;
    this.checkBank = checkBank;
  }

  async execute(): Promise<boolean> {
    var result = true;
    this.startJob();

    await this.runSharedPrereqChecks();

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);
    var numInBank = 0;

    // Sometimes we want to collect a bunch of the resource so we should skip checking the bank
    // Other times we want to gather stuff to then craft so taking from the bank is OK
    if (this.checkBank) {
      numInBank = await this.character.checkQuantityOfItemInBank(
        this.target.code,
      );
    }

    if (numInInv >= this.target.quantity) {
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
      result = await this.gather(this.target.quantity, this.target.code);
    }

    this.completeJob(result);
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {}

  async gather(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

      var numHeld = this.character.checkQuantityOfItemInInv(code);
      logger.info(`${numHeld} ${code} in inventory`);
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
          !(await this.character.checkWeaponForEffects(
            resourceDetails.subtype,
          )) &&
          isGatheringSkill(resourceDetails.subtype)
        ) {
          await this.character.equipBestWeapon(
            resourceDetails.subtype as GatheringSkill,
          );
        }
      }

      // Evaluate our inventory space before we start collecting items
      await this.character.evaluateDepositItemsInBank([code], {
        x: this.character.data.x,
        y: this.character.data.y,
      });

      if (resourceDetails.subtype === 'mob') {
        return await this.gatherMobDrop(
          { code: resourceDetails.code, quantity: quantity },
          numHeld,
        );
      } else if (resourceDetails.craft) {
        this.character.prependJob(
          new CraftObjective(this.character, {
            code: resourceDetails.code,
            quantity: quantity,
          }),
        );
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
    numHeld: number,
    remainderToGather: number,
    location: DestinationSchema,
  ): Promise<boolean> {
    // Loop that does the gather requests
    for (var count = 0; count < remainderToGather; count++) {
      if (count % 5 === 0) {
        numHeld = this.character.checkQuantityOfItemInInv(target.code);
        logger.info(`Gathered ${numHeld}/${target.quantity} ${target.code}`);
        // Check inventory space to make sure we are less than 90% full
        await this.character.evaluateDepositItemsInBank(
          [target.code],
          location,
        );
      }

      const response = await actionGather(this.character.data);

      if (response instanceof ApiError) {
        await this.character.handleErrors(response);

        return false;
      } else {
        this.character.data = response.data.character;
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
        logger.info(`Gathered ${numHeld}/${target.quantity} ${target.code}`);

        // ToDo: make this check all mobs in case multiple drop the item
        await this.character.fightNow(1, mobInfo.data[0].code);

        numHeld = this.character.checkQuantityOfItemInInv(target.code);
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
      numHeld,
      remainderToGather,
      {
        x: contentLocation.x,
        y: contentLocation.y,
      },
    );

    numHeld = this.character.checkQuantityOfItemInInv(code);
    if (numHeld >= quantity) {
      logger.info(`Successfully gathered ${quantity} ${code}`);
      return true;
    } else {
      logger.info(
        `Only holding ${numHeld} ${code}. Collecting ${quantity - numHeld} more`,
      );
      await this.gatherItemLoop(
        { code: code, quantity: quantity - numHeld },
        numHeld,
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
