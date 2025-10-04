import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getItemInformation } from '../api_calls/Items.js';
import { actionRecycle } from '../api_calls/Recycling.js';

/**
 * @description Recycles the specified items and deposits the results into the bank
 */
export class RecycleObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `recycle_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Recycle the item. Character will move to the correct workshop map
   */
  async run(): Promise<boolean> {
    // ToDo:
    // [x] Should I check to make sure the amount is actually in the bank first?
    // [x] Withdraw the items from the bank
    // [x] Find the right workshop map
    // [x] Move to that workshop
    // [x] Recycle items
    // [x] Deposit the resulting items into the bank
    // [] Calculate how many resulting items we can carry, batch it based on the result
    //      - i.e recycling 90 iron_armor would result in 180 iron_bar which is too many

    let result = false;

    if (this.isCancelled()) {
      logger.info(`${this.objectiveId} has been cancelled`);
      //this.character.removeJob(this.objectiveId);
      return false;
    }

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);

    if (
      !(await this.character.withdrawNow(
        this.target.quantity - numInInv,
        this.target.code,
      ))
    ) {
      logger.warn(
        `Failed to withdraw ${this.target.quantity - numInInv} ${this.target.code} from the bank`,
      );
      return result;
    }

    const itemInfo = await getItemInformation(this.target.code);
    if (itemInfo instanceof ApiError) {
      this.character.handleErrors(itemInfo);
    } else {
      const maps = await getMaps({
        content_code: itemInfo.craft.skill,
        content_type: 'workshop',
      });
      if (maps instanceof ApiError) {
        return this.character.handleErrors(maps);
      }

      if (maps.data.length === 0) {
        logger.error(`Cannot find any maps to recycle ${this.target.code}`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps.data);

      await this.character.move(contentLocation);

      const recycleResult = await actionRecycle(
        this.character.data,
        this.target.code,
        this.target.quantity,
      );
      if (recycleResult instanceof ApiError) {
        logger.info(recycleResult.message);
        await this.character.handleErrors(recycleResult);
        return false;
      } else {
        if (recycleResult.data.character) {
          this.character.data = recycleResult.data.character;
        } else {
          logger.error('Recycle response missing character data');
          return false;
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
