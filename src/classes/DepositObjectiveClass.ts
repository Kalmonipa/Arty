import { actionDepositItems, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';

export class DepositObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`deposit_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.startJob();

    this.runPrerequisiteChecks();

    const result = await this.deposit(this.target.quantity, this.target.code);
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

  /**
   * @description deposit the specified items into the bank
   * @todo If 0 is entered, deposit all of that item
   */
  async deposit(quantity: number, itemCode: string, maxRetries: number = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Deposit attempt ${attempt}/${maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = (await getMaps(undefined, 'bank')).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      // ToDo:
      // - If quantity is 0, deposit all of that item
      // - If code is 'all', deposit all items in inv into the bank
      const response = await actionDepositItems(this.character.data, [
        { quantity: quantity, code: itemCode },
      ]);

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === maxRetries) {
          logger.error(`Deposit failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        this.character.data = response.data.character;
      }
      return true;
    }
  }
}
