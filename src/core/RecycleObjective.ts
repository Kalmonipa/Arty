import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getItemInformation } from '../api_calls/Items.js';
import { actionRecycle } from '../api_calls/Recycling.js';

/**
 * @description Recycles the specified items and deposits the results into the bank
 */
export class RecycleObjective extends Objective {
  target: ObjectiveTargets; // ToDo: USe SimpleItemSchema

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `recycle_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'Recycle';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Recycle the item. Character will move to the correct workshop map
   * @todo Add retry logic
   */
  async run(): Promise<boolean> {
    let result = false;

    if (!(await this.checkStatus())) return false;

    const numInInv = this.character.checkQuantityOfItemInInv(this.target.code);

    if (
      // Withdraw the smaller of the amount needed or 10 so that we know we have enough inventory space
      !(await this.character.withdrawNow(
        Math.min(this.target.quantity - numInInv, 10),
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
      const maps = this.character.findMaps({
        content_code: itemInfo.craft.skill,
        content_type: 'workshop',
      });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps to recycle ${this.target.code}`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

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
