import { getItemInformation } from '../api_calls/Items.js';
import { actionTasksTrade } from '../api_calls/Tasks.js';
import { ItemSchema, TaskTradeResponseSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class ItemTaskObjective extends Objective {
  type: 'items';
  quantity: number;

  constructor(character: Character, quantity: number) {
    super(character, `task_${quantity}_itemstask`, 'not_started');

    this.character = character;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let result = false;

    for (let count = 0; count < this.quantity; count++) {
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        return false;
      }
      logger.info(`Completed ${count}/${this.quantity} tasks`);
      result = await this.doTask();
    }

    return result;
  }

  async doTask(): Promise<boolean> {
    if (this.isCancelled()) {
      logger.info(`${this.objectiveId} has been cancelled`);
      //this.character.removeJob(this.objectiveId);
      return false;
    }

    if (this.character.data.task === '') {
      await this.startNewTask('items');
    } else {
      logger.info(
        `Continuing task to collect ${this.character.data.task_total} ${this.character.data.task}. Collected ${this.character.data.task_progress} so far`,
      );
    }

    // get information on the requested item
    const taskInfo: ApiError | ItemSchema = await getItemInformation(
      this.character.data.task,
    );
    if (taskInfo instanceof ApiError) {
      await this.character.handleErrors(taskInfo);
      return false;
    } else {
      while (
        this.character.data.task_progress < this.character.data.task_total
      ) {
        if (this.isCancelled()) {
          logger.info(`${this.objectiveId} has been cancelled`);
          //this.character.removeJob(this.objectiveId);
          return false;
        }

        // If we need to collect less than 80, gather that amount, otherwise gather 90% of their inventory space
        var numToGather = Math.min(
          this.character.data.task_total - this.character.data.task_progress,
          Math.ceil(this.character.data.inventory_max_items * 0.9),
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

        logger.debug(
          `Num gathered: ${numGathered}, Num remaining: ${numToGather}`,
        );

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

            return false;
          } else {
            this.character.data = taskTradeResponse.data.character;
          }
        } else if (taskInfo.craft) {
          logger.debug(`${taskInfo.code} is a crafted item. Crafting...`);
          if (
            !(await this.character.craftNow(
              numToGather,
              this.character.data.task,
            ))
          ) {
            return this.cancelCurrentTask('items');
          }
        } else {
          logger.debug(`${taskInfo.code} is a gather resource. Gathering...`);
          // If we get a task to get an item that we aren't high enough to gather, we'd like to exit out.
          // This happens sometimes with fish when our cooking level is high
          // but fishing might be too low to actually gather the required ingredient
          if (
            !(await this.character.gatherNow(
              numToGather,
              this.character.data.task,
              true,
              true,
            ))
          ) {
            // Cancel the job and start a new one
            return this.cancelCurrentTask('items');
          }
        }
      }
    }

    if (this.character.data.task_total === this.character.data.task_progress) {
      await this.handInTask('items');

      return true;
    }
  }
}
