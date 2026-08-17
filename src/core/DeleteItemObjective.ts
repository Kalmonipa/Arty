import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { actionDeleteItem } from '../api_calls/Items.js';

/**
 * @description Delete the specified items
 */
export class DeleteItemObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(character, `delete_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'DeleteItem';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description Find the item and delete it
   */
  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);

    if (
      !(
        await this.character.withdrawNow(
          this.target.quantity - numInInv,
          this.target.code,
        )
      ).success
    ) {
      logger.warn(
        `Failed to withdraw ${this.target.quantity - numInInv} ${this.target.code} from the bank`,
      );
      return ObjectiveFailed;
    }

    logger.info(`Deleting ${this.target.quantity} ${this.target.code}`);

    const deleteResult = await actionDeleteItem(this.character.data, {
      code: this.target.code,
      quantity: this.target.quantity,
    });
    if (deleteResult instanceof ApiError) {
      logger.info(deleteResult.message);
      await this.character.handleErrors(deleteResult);
      return ObjectiveFailed;
    } else {
      if (deleteResult.data.character) {
        this.character.data = deleteResult.data.character;
      } else {
        logger.error('Delete response missing character data');
        return ObjectiveFailed;
      }

      return { complete: true, success: true, reason: 'complete' };
    }
  }
}
