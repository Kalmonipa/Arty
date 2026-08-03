import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { getItemInformation } from '../api_calls/Items.js';
import { actionRecycle } from '../api_calls/Recycling.js';

/**
 * @description Recycles the specified items and deposits the results into the bank
 */
export class RecycleObjective extends Objective {
  target: ObjectiveTargets; // ToDo: USe SimpleItemSchema
  /**
   * Enabled enhanced recycling which rewards 30% more materials. Defaults to true
   */
  enhanced: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    enhanced?: boolean,
  ) {
    super(
      character,
      `recycle_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'Recycle';
    this.target = target;
    this.enhanced = enhanced ?? true;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Recycle the item. Character will move to the correct workshop map
   * @todo Add retry logic
   */
  async run(): Promise<ObjectiveResult> {
    let result: ObjectiveResult = {
      complete: false,
      success: false,
      reason: 'in_progress',
    };

    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);

    if (
      // Withdraw the smaller of the amount needed or 10 so that we know we have enough inventory space
      !(
        await this.character.withdrawNow(
          Math.min(this.target.quantity - numInInv, 10),
          this.target.code,
        )
      ).success
    ) {
      logger.warn(
        `Failed to withdraw ${this.target.quantity - numInInv} ${this.target.code} from the bank`,
      );
      return ObjectiveFailed;
    }

    const itemInfo = await getItemInformation(this.target.code);
    if (itemInfo instanceof ApiError) {
      this.character.handleErrors(itemInfo);
    } else {
      const maps = this.character.findMaps({
        content_code: itemInfo.craft.skill,
        content_type: 'workshop',
      });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps to recycle ${this.target.code}`);
        return ObjectiveFailed;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move(contentLocation);

      const recycleResult = await actionRecycle(
        this.character.data,
        this.target.code,
        this.target.quantity,
        this.enhanced,
      );
      if (recycleResult instanceof ApiError) {
        logger.info(recycleResult.message);
        await this.character.handleErrors(recycleResult);
        return ObjectiveFailed;
      } else {
        if (recycleResult.data.character) {
          this.character.data = recycleResult.data.character;
        } else {
          logger.error('Recycle response missing character data');
          return ObjectiveFailed;
        }

        for (const item of recycleResult.data.details.items) {
          result = await this.character.depositNow(item.quantity, item.code);
        }
        return result;
      }
    }

    return result;
  }
}
