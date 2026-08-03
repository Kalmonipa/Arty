import { actionWithdrawItem } from '../api_calls/Actions.js';
import { actionWithdrawGold } from '../api_calls/Bank.js';
import {
  ObjectiveCancelled,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { invalidateBankQuantities } from './bankQuantityCache.js';
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
    this.jobFlavour = 'Withdraw';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async run(): Promise<ObjectiveResult> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      logger.debug(`Withdraw attempt ${attempt}/${this.maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = await this.character.getAvailableBanks();

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return { complete: true, success: false, reason: 'failed' };
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move(contentLocation);

      // If we're withdrawing gold, do it and return early
      if (this.target.code === 'gold') {
        const response = await actionWithdrawGold(
          this.character.data,
          this.target.quantity,
        );
        if (response instanceof ApiError) {
          logger.warn(`Withdraw gold attempt failed`);
          return { complete: true, success: false, reason: 'failed' };
        }

        return { complete: true, success: true, reason: 'complete' };
      }

      // Otherwise withdraw the item
      const response = await actionWithdrawItem(this.character.data, [
        { quantity: this.target.quantity, code: this.target.code },
      ]);

      if (response instanceof ApiError) {
        // Usually 478: another character emptied the bank since we last read it.
        // Drop the memo so the next check sees what's really there
        invalidateBankQuantities([this.target.code]);

        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Withdraw failed after ${attempt} attempts`);
          return { complete: true, success: false, reason: 'failed' };
        }
        continue;
      } else {
        if (response.data.character) {
          this.character.data = response.data.character;
        } else {
          logger.error('Withdraw response missing character data');
        }
        return { complete: true, success: true, reason: 'complete' };
      }
    }
  }
}
