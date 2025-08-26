import { actionCraft, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { getItemInformation } from '../api_calls/Items';
import { GatherObjective } from './GatherObjectiveClass';
import { FightObjective } from './FightObjectiveClass';
import { ItemSchema } from '../types/types';
import { getCipherInfo } from 'node:crypto';

export class CraftObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.startJob();

    await this.runPrerequisiteChecks();

    if (this.character.jobList.indexOf(this) !== 0) {
      logger.info(
        `Current job (${this.objectiveId}) has ${this.character.jobList.indexOf(this)} preceding jobs. Moving focus to ${this.character.jobList[0].objectiveId}`,
      );
      await this.character.jobList[0].execute(this.character);
    }

    const result = await this.character.craft(
      this.target.quantity,
      this.target.code,
    );

    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {
    logger.debug(`Checking item schema of ${this.target.code}`);
    const response: ItemSchema | ApiError = await getItemInformation(
      this.target.code,
    );

    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
    } else if (response.craft) {
      for (const craftingItem of response.craft.items) {
        logger.debug(`Checking ${craftingItem.code}`);
        const craftingItemInfo: ItemSchema | ApiError =
          await getItemInformation(craftingItem.code);

        if (craftingItemInfo instanceof ApiError) {
          logger.warn(
            `${craftingItemInfo.error.message} [Code: ${craftingItemInfo.error.code}]`,
          );
        } else {
          const numInInv = this.character.checkQuantityOfItemInInv(
            craftingItem.code,
          );

          // ToDo: check bank
          if (numInInv >= craftingItem.quantity) {
            logger.info(
              `${numInInv} ${craftingItem.code} in inventory already. No need to collect more`,
            );
            continue;
          }
          if (craftingItemInfo.subtype === 'mob') {
            logger.debug(`Resource ${craftingItemInfo.code} is a mob drop`);

            this.character.prependJob(
              new GatherObjective(this.character, {
                code: craftingItem.code,
                quantity: craftingItem.quantity - numInInv,
              }),
            );
          } else if (craftingItemInfo.craft !== null) {
            logger.debug(
              `Resource ${craftingItemInfo.code} is a craftable item`,
            );

            this.character.prependJob(
              new CraftObjective(this.character, {
                code: craftingItem.code,
                quantity: craftingItem.quantity - numInInv,
              }),
            );
          } else {
            // It must be a gather resource
            if (response.craft) {
              logger.debug(
                `Resource ${craftingItem.code} is a gatherable item`,
              );

              this.character.prependJob(
                new GatherObjective(this.character, {
                  code: craftingItem.code,
                  quantity: craftingItem.quantity - numInInv,
                }),
              );
            }
          }
        }
      }
    } else {
      logger.info(`No craft items`);
    }
  }
}
