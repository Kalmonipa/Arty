import * as crypto from 'node:crypto';
import { ObjectiveStatus } from '../types/ObjectiveData.js';
import { Character } from './Character.js';
import { logger } from '../utils.js';
import { getMaps } from '../api_calls/Maps.js';
import {
  actionAcceptNewTask,
  actionCancelTask,
  actionCompleteTask,
} from '../api_calls/Tasks.js';
import { ApiError } from './Error.js';
import { TaskType } from '../types/types.js';

export abstract class Objective {
  character: Character;
  objectiveId: string;
  progress: number;
  status: ObjectiveStatus;
  maxRetries: number = 3;
  parentId?: string;
  childId?: string;

  constructor(
    character: Character,
    objectiveId: string,
    status: ObjectiveStatus,
    parentId?: string,
    childId?: string,
  ) {
    this.character = character;
    // appending a random string to the objectiveId to ensure uniqueness
    this.objectiveId =
      objectiveId + `_${crypto.randomBytes(2).toString('hex')}`;
    this.status = status;

    this.progress = 0;
    this.parentId = parentId;
    this.childId = childId;
  }

  async execute(): Promise<boolean> {
    this.character.isIdle = false;
    if (this.status === 'cancelled') {
      return false;
    }

    // Check if parent job has been cancelled
    if (this.cancelIfParentIsCancelled()) {
      return false;
    }

    this.startJob();

    await this.runSharedPrereqChecks();
    let result = await this.runPrerequisiteChecks();
    // If prerequisite checks fail then we should stop the job
    if (result) {
      result = await this.run();
    } else {
      logger.warn(
        `Prerequisite checks for ${this.objectiveId} failed. Stopping job`,
      );
    }

    this.completeJob(result);
    this.character.isIdle = true;
    return result;
  }

  abstract run(): Promise<boolean>;

  /**
   * @description Prerequisite checks that each job configures in their own class
   */
  abstract runPrerequisiteChecks(): Promise<boolean>;

  /**
   * @description Runs some validations that all jobs run before they start
   */
  async runSharedPrereqChecks(): Promise<boolean> {
    await this.character.cooldownStatus();

    await this.depositGoldIntoBank(5000)

    return true;
  }

  /**
   * @description Cancels the currently active job
   */
  cancelJob(): boolean {
    logger.info(`Setting status of ${this.objectiveId} to 'cancelled'`);
    this.status = 'cancelled';
    return true;
  }

  /**
   * @description If the parent job has been cancelled we should cancel any child jobs
   */
  cancelIfParentIsCancelled(): boolean {
    if (this.parentId) {
      // Find the parent job in the character's job list
      const parentJob = this.character.jobList.find(
        (job) => job.objectiveId === this.parentId,
      );
      if (parentJob && parentJob.status === 'cancelled') {
        logger.info(
          `Parent job ${this.parentId} is cancelled, cancelling child job ${this.objectiveId}`,
        );
        this.cancelJob();
        return true;
      }
    }
    return false;
  }

  /**
   * @description Sets the status of the job to 'in_progress'
   */
  startJob() {
    logger.info(`Setting status of ${this.objectiveId} to 'in_progress'`);
    this.status = 'in_progress';
  }

  /**
   * @description Sets the status of the job to 'complete'
   */
  completeJob(wasSuccess: boolean) {
    if (wasSuccess) {
      logger.info(`Setting status of ${this.objectiveId} to 'complete'`);
      this.status = 'complete';
    } else {
      if (this.status === 'cancelled') {
        return;
      } else {
        logger.info(`Setting status of ${this.objectiveId} to 'failed'`);
        this.status = 'failed';
      }
    }
  }

  /**
   * @description Checks if the job has been cancelled. If cancelled, should stop the loop
   * This must be implemented in all job loops to ensure cancelling will cancel the job
   * @returns true if cancelled, false if not
   */
  isCancelled(): boolean {
    if (this.status === 'cancelled') {
      return true;
    } else {
      return false;
    }
  }

  /********
   * Task functions
   ********/

  /**
   * @description Withdraws a task coin, moves to the task master and cancels the current task
   */
  async cancelCurrentTask(taskType: TaskType): Promise<boolean> {
    if (this.character.checkQuantityOfItemInInv('tasks_coin') < 1) {
      if (!(await this.character.withdrawNow(1, 'tasks_coin'))) {
        return false;
      }
    }

    await this.moveToTaskMaster(taskType);

    const response = await actionCancelTask(this.character.data);
    if (response instanceof ApiError) {
      await this.character.handleErrors(response);
    } else {
      this.character.data = response.character;
    }
  }

  /**
   * @description Moves to the nearest task master
   */
  async moveToTaskMaster(taskType: TaskType) {
    const maps = await getMaps({
      content_code: taskType,
      content_type: 'tasks_master',
    });
    if (maps instanceof ApiError) {
      return this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });
  }

  /**
   * @description Gets a new task from the specified task master
   * @returns
   */
  async startNewTask(taskType: TaskType) {
    await this.moveToTaskMaster(taskType);

    const response = await actionAcceptNewTask(this.character.data);

    if (response instanceof ApiError) {
      await this.character.handleErrors(response);
    } else {
      if (response.data.character) {
        this.character.data = response.data.character;
      } else {
        logger.error('Task response missing character data');
      }
    }
  }

  /**
   * @description Finds the relevant task master and hands in the task
   */
  async handInTask(taskType: TaskType) {
    if (taskType === 'monsters') {
      logger.info(
        `Completed ${this.character.data.task_total} fights. Handing in task`,
      );
    } else if (taskType === 'items') {
      logger.info(
        `Collected ${this.character.data.task_total} items. Handing in task`,
      );
    }
    const maps = await getMaps({
      content_code: taskType,
      content_type: 'tasks_master',
    });
    if (maps instanceof ApiError) {
      return this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    const response = await actionCompleteTask(this.character.data);

    if (response instanceof ApiError) {
      await this.character.handleErrors(response);
      // ToDo: handle complete task errors
    } else {
      if (response.data.character) {
        this.character.data = response.data.character;
      } else {
        logger.error('Complete task response missing character data');
      }
    }

    return true;
  }

    /**
   * @description Deposits gold into the bank if they have more than 1k
   * @returns
   */
    protected async depositGoldIntoBank(maxGoldInInv: number): Promise<boolean> {
      const numGoldInInv = this.character.data.gold;
  
      if (numGoldInInv > maxGoldInInv) {
        return await this.character.depositNow(numGoldInInv - maxGoldInInv, 'gold');
      }
  
      return true;
    }
}
