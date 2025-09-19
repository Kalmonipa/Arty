import { actionWithdrawItem } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class WithdrawObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `withdraw_${target.quantity}_${target.code}`,
      'not_started',
    );
    this.character = character;
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async run() {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        //this.character.removeJob(this.objectiveId);
        return false;
      }

      logger.debug(`Withdraw attempt ${attempt}/${this.maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = await getMaps({ content_type: 'bank' });
      if (maps instanceof ApiError) {
        return this.character.handleErrors(maps);
      }

      if (maps.data.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return true;
      }

      const contentLocation = this.character.evaluateClosestMap(maps.data);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      const response = await actionWithdrawItem(this.character.data, [
        { quantity: this.target.quantity, code: this.target.code },
      ]);

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Withdraw failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        this.character.data = response.data.character;
        return true;
      }
    }
  }
}
