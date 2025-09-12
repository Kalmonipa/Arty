import * as crypto from 'node:crypto';
import { ObjectiveStatus, ObjectiveTargets } from '../types/ObjectiveData';
import { Character } from './Character';
import { logger, sleep } from '../utils';
import { getMaps } from '../api_calls/Maps';
import { actionAcceptNewTask, actionCompleteTask } from '../api_calls/Tasks';
import { ApiError } from './Error';
import { TaskType } from '../types/types';

export abstract class Objective {
  character: Character;
  objectiveId: string;
  status: ObjectiveStatus;
  maxRetries: number = 3;

  constructor(
    character: Character,
    objectiveId: string,
    status: ObjectiveStatus,
  ) {
    this.character = character;
    // appending a random string to the objectiveId to ensure uniqueness
    this.objectiveId =
      objectiveId + `_${crypto.randomBytes(2).toString('hex')}`;
    this.status = status; // ToDo: Do something with the statuses
  }

  async execute(): Promise<boolean> {
    this.character.isIdle = false;
    this.startJob();

    await this.runSharedPrereqChecks();
    await this.runPrerequisiteChecks();

    const result = await this.run();

    this.completeJob(result);
    this.character.isIdle = true;
    return result;
  }

  abstract run(): Promise<boolean>;

  abstract runPrerequisiteChecks(): Promise<boolean>;

  /**
   * @description Runs some validations that all jobs run before they start
   */
  async runSharedPrereqChecks(): Promise<boolean> {
    await this.character.cooldownStatus();

    return true;
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
      logger.info(`Setting status of ${this.objectiveId} to 'failed'`);
      this.status = 'failed';
    }
  }

  /**
   * @description Moves to the nearest task master
   */
  async moveToTaskMaster(taskType: TaskType) {
    const maps = (await getMaps(taskType, 'tasks_master')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

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
      this.character.data = response.data.character;
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
    const maps = (await getMaps(taskType, 'tasks_master')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    const response = await actionCompleteTask(this.character.data);

    if (response instanceof ApiError) {
      await this.character.handleErrors(response);
      // ToDo: handle complete task errors
    } else {
      this.character.data = response.data.character;
    }

    return true;
  }
}
