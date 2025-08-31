import { actionGather } from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { getMonsterInformation } from '../api_calls/Monsters';
import { getResourceInformation } from '../api_calls/Resources';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  DestinationSchema,
  GetAllMonstersMonstersGetResponse,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { CraftObjective } from './CraftObjectiveClass';
import { EquipObjective } from './EquipObjectiveClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class GatherObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`gather_${target.quantity}_${target.code}`, 'not_started');
    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    var result = true;
    this.startJob();

    await this.runPrerequisiteChecks();

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);

    const numInBank = await this.character.checkQuantityOfItemInBank(
      this.target.code,
    );

    if (numInInv >= this.target.quantity) {
      logger.info(
        `${numInInv} ${this.target.code} in inventory already. No need to collect more`,
      );
      return true;
    } else if (numInBank >= this.target.quantity) {
      logger.info(
        `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${this.target.quantity}`,
      );
      await this.character.withdrawNow(this.target.quantity, this.target.code);
    } else {
      result = await this.gather(this.target.quantity, this.target.code);
    }

    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {
    await this.character.cooldownStatus();

    if (this.character.jobList.indexOf(this) !== 0) {
      logger.info(
        `Current job (${this.objectiveId}) has ${this.character.jobList.indexOf(this)} preceding jobs. Moving focus to ${this.character.jobList[0].objectiveId}`,
      );
      await this.character.jobList[0].execute(this.character);
    }
  }

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
          !(await this.character.checkWeaponForEffects(resourceDetails.subtype))
        ) {
          for (const item of this.character.data.inventory) {
            if (item.quantity > 0) {
              const itemInfo = await getItemInformation(item.code);
              if (itemInfo instanceof ApiError) {
                const shouldRetry = await this.character.handleErrors(itemInfo);

                if (!shouldRetry || attempt === maxRetries) {
                  logger.error(`Gather failed after ${attempt} attempts`);
                  return false;
                }
                continue;
              } else if (itemInfo.code === '') {
                logger.info(`No more items to check in inventory`);
              } else {
                for (const effect of itemInfo.effects) {
                  if (effect.code === resourceDetails.subtype) {
                    this.character.equipNow(item.code, 'weapon'); // ToDo: apparently this doesn't work
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
      await this.character.evaluateDepositItemsInBank(code);

      if (resourceDetails.subtype === 'mob') {
        await this.gatherMobDrop(
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
        await this.gatherResource(code, quantity, numHeld, remainderToGather);
      }
    }
  }

  async gatherItemLoop(
    target: SimpleItemSchema,
    numHeld: number,
    remainderToGather: number,
    location: DestinationSchema,
    maxRetries: number = 3,
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

      // Loop that does the gather requests
      for (var count = 0; count < remainderToGather; count++) {
        if (count % 5 === 0) {
          numHeld = this.character.checkQuantityOfItemInInv(target.code);
          logger.info(`Gathered ${numHeld}/${target.quantity} ${target.code}`);
          // Check inventory space to make sure we are less than 90% full
          if (await this.character.evaluateDepositItemsInBank(target.code)) {
            // If items were deposited, we need to move back to the gathering location
            await this.character.move(location);
          }
        }

        const response = await actionGather(this.character.data);

        if (response instanceof ApiError) {
          const shouldRetry = await this.character.handleErrors(response);

          if (!shouldRetry || attempt === maxRetries) {
            logger.error(`Gather failed after ${attempt} attempts`);
            return false;
          }
          continue;
        } else {
          this.character.data = response.data.character;
        }
      }
    }
  }

  async gatherMobDrop(target: SimpleItemSchema, numHeld: number) {
    const mobInfo: GetAllMonstersMonstersGetResponse | ApiError =
      await getMonsterInformation({
        query: { drop: target.code, max_level: this.character.data.level },
        url: '/monsters',
      });
    if (mobInfo instanceof ApiError) {
      logger.error(`Failed to find the mob that drops ${target.code}`);
    } else {
      const remainderToGather = target.quantity - numHeld;

      while (numHeld < remainderToGather) {
        logger.info(`Gathered ${numHeld}/${target.quantity} ${target.code}`);

        // ToDo: make this check all mobs in case multiple drop the item
        await this.character.fightNow(1, mobInfo.data[0].code);

        numHeld = this.character.checkQuantityOfItemInInv(target.code);
      }
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
    logger.info(`Finding resource map type for ${code}`);

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
