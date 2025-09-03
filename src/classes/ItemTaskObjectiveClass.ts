import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import {
  actionAcceptNewTask,
  actionCompleteTask,
  actionTasksTrade,
} from '../api_calls/Tasks';
import { ItemSchema, TaskTradeResponseSchema } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class ItemTaskObjective extends Objective {
  type: 'items';

  constructor(character: Character) {
    super(character, `task_1_itemstask`, 'not_started');

    this.character = character;
  }

  async execute(): Promise<boolean> {
    var result = true;
    await this.runPrerequisiteChecks();

    // Check if we have the item alread in inv and bank
    // Gather the required items

    if (this.character.data.task === '') {
      await this.startNewTask('items');
    } else {
      logger.debug(
        `Continuing task to collect ${this.character.data.task_total} ${this.character.data.task}`,
      );
    }

    // get information on the requested item
    const taskInfo: ApiError | ItemSchema = await getItemInformation(
      this.character.data.task,
    );
    if (taskInfo instanceof ApiError) {
      await this.character.handleErrors(taskInfo);
      result = false;
    } else {
      while (
        this.character.data.task_progress < this.character.data.task_total
      ) {
        // If we need to collect less than 80, gather that amount, otherwise gather 80
        var numToGather = Math.min(
          this.character.data.task_total - this.character.data.task_progress,
          80,
        );

        var numInBank = await this.character.checkQuantityOfItemInBank(
          this.character.data.task,
        );

        if (numInBank > 0) {
          await this.character.withdrawNow(
            Math.min(numInBank, numToGather),
            this.character.data.task,
          );
        }

        var numGathered = this.character.checkQuantityOfItemInInv(
          this.character.data.task,
        );

        logger.debug(`Num to gather: ${numToGather}`);
        logger.debug(`Num gathered: ${numGathered}`);

        if (numToGather <= numGathered) {
          logger.debug(`Handing in ${numToGather} ${this.character.data.task}`);
          await this.moveToTaskMaster('items');

          const taskTradeResponse: ApiError | TaskTradeResponseSchema =
            await actionTasksTrade(this.character.data, {
              code: this.character.data.task,
              quantity: numToGather,
            });
          if (taskTradeResponse instanceof ApiError) {
            logger.warn(taskTradeResponse.message);
            await this.character.handleErrors(taskTradeResponse);

            result = false;
            break;
          } else {
            this.character.data = taskTradeResponse.data.character;
          }
        } else if (taskInfo.craft) {
          await this.character.craftNow(numToGather, this.character.data.task);
        } else {
          await this.character.gatherNow(numToGather, this.character.data.task);
        }
      }
    }

    if (this.character.data.task_total === this.character.data.task_progress) {
      await this.handInTask('items');

      result = true;
    }
    this.completeJob(result);
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
}
