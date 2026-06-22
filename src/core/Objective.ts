import * as crypto from 'node:crypto';
import { ObjectiveStatus } from '../types/ObjectiveData.js';
import { Character } from './Character.js';
import { logger, sleep } from '../utils.js';
import {
  jobActiveGauge,
  jobCompletionsCounter,
  jobDurationHistogram,
} from '../metrics.js';
import { getMaps } from '../api_calls/Maps.js';
import { actionAcceptNewTask, actionCancelTask } from '../api_calls/Tasks.js';
import { ApiError } from './Error.js';
import { TaskType } from '../types/types.js';

export abstract class Objective {
  character: Character;
  objectiveId: string;
  jobFlavour: string;
  progress: number;
  status: ObjectiveStatus;
  maxRetries: number = 3;
  parentId?: string;
  childId?: string;
  rootId: string;
  protected log: typeof logger;
  /** Set to true in subclasses that represent meaningful work worth tracking */
  protected shouldEmitMetrics: boolean = false;
  /** What specifically is being done — item code, monster code, skill name, role, etc. */
  metricLabel: string = '';
  private startTimeMs: number = 0;

  constructor(
    character: Character,
    objectiveId: string,
    status: ObjectiveStatus,
    parentId?: string,
    childId?: string,
    rootId?: string,
  ) {
    this.character = character;
    // appending a random string to the objectiveId to ensure uniqueness
    this.objectiveId =
      objectiveId + `_${crypto.randomBytes(2).toString('hex')}`;
    this.status = status;

    this.progress = 0;
    this.parentId = parentId;
    this.childId = childId;

    // Calculate rootId: if provided use it, if has parent use parent's rootId, otherwise this is the root
    if (rootId) {
      this.rootId = rootId;
    } else if (parentId) {
      // Find the parent and use its rootId directly (they stem from the same root)
      const parentJob = this.character.jobList.find(
        (job) => job.objectiveId === parentId,
      );
      this.rootId = parentJob?.rootId || parentId;
    } else {
      // This is the root objective
      this.rootId = this.objectiveId;
    }

    // Create a child logger with objectiveId and rootId in default metadata
    this.log = logger.child({
      objectiveId: this.objectiveId,
      rootId: this.rootId,
    });
  }

  async execute(): Promise<boolean> {
    if (!(await this.checkStatus())) return false;

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
      this.log.warn(
        `Prerequisite checks for ${this.objectiveId} failed. Stopping job`,
      );
    }

    this.completeJob(result);
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

    if (this.character.enableEvents) {
      await this.character.checkForActiveEvents();
    }

    return true;
  }

  /**
   * @description Cancels the currently active job
   */
  cancelJob(): boolean {
    this.log.info(`Setting status of ${this.objectiveId} to 'cancelled'`);
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
        this.log.info(
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
    this.log.info(`Setting status of ${this.objectiveId} to 'in_progress'`);
    this.status = 'in_progress';
    this.startTimeMs = Date.now();
    if (this.shouldEmitMetrics) {
      if (this.parentId) {
        const parentJob = this.character.jobList.find(
          (job) => job.objectiveId === this.parentId,
        );
        if (parentJob?.shouldEmitMetrics) {
          jobActiveGauge.set(
            {
              character: this.character.data.name,
              job_type: parentJob.jobFlavour,
              target: parentJob.metricLabel,
            },
            0,
          );
        }
      }
      jobActiveGauge.set(
        {
          character: this.character.data.name,
          job_type: this.jobFlavour,
          target: this.metricLabel,
        },
        1,
      );
    }
  }

  /**
   * @description Sets the status of the job to 'complete'
   */
  completeJob(wasSuccess: boolean) {
    if (wasSuccess) {
      this.log.info(`Setting status of ${this.objectiveId} to 'complete'`);
      this.status = 'complete';
    } else {
      if (this.status === 'cancelled') {
        this.character.itemsToKeep = [];
        // A cancelled job that already started still has its active gauge set to
        // 1; clear it so the job doesn't appear to run forever on the dashboards.
        this.clearActiveMetric();
        return;
      } else {
        this.log.info(`Setting status of ${this.objectiveId} to 'failed'`);
        this.status = 'failed';
      }
    }

    if (this.shouldEmitMetrics) {
      const durationSeconds = (Date.now() - this.startTimeMs) / 1000;
      const labels = {
        character: this.character.data.name,
        job_type: this.jobFlavour,
        target: this.metricLabel,
      };
      jobCompletionsCounter.inc({ ...labels, status: this.status });
      jobDurationHistogram.observe(labels, durationSeconds);
      this.clearActiveMetric();
    }
  }

  /**
   * @description Marks this job as no longer active in metrics and restores the
   * parent job's active gauge. Safe to call however the job ended (complete,
   * failed or cancelled); no-ops when this job doesn't emit metrics.
   */
  private clearActiveMetric() {
    if (!this.shouldEmitMetrics) return;

    jobActiveGauge.set(
      {
        character: this.character.data.name,
        job_type: this.jobFlavour,
        target: this.metricLabel,
      },
      0,
    );

    if (this.parentId) {
      const parentJob = this.character.jobList.find(
        (job) => job.objectiveId === this.parentId,
      );
      if (parentJob?.shouldEmitMetrics) {
        jobActiveGauge.set(
          {
            character: this.character.data.name,
            job_type: parentJob.jobFlavour,
            target: parentJob.metricLabel,
          },
          1,
        );
      }
    }
  }

  /**
   * @description Updates rootId when parentId is set after construction
   */
  updateRootId(): void {
    if (this.parentId) {
      // Find the parent and use its rootId directly
      const parentJob = this.character.jobList.find(
        (job) => job.objectiveId === this.parentId,
      );
      this.rootId = parentJob?.rootId || this.parentId;
      // Update the logger with new rootId
      this.log = logger.child({
        objectiveId: this.objectiveId,
        rootId: this.rootId,
      });
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

  /**
   * @description Does various status checks on the objective
   * If cancelled, fails the job
   * If paused, sleeps for 10 seconds then rechecks the status until it's resumed
   * @returns false if the objective should fail, true if the objective should continue
   */
  async checkStatus(): Promise<boolean> {
    if (this.isCancelled()) {
      this.log.info(`${this.objectiveId} has been cancelled`);
      return false;
    }

    while (this.status === 'paused') {
      await sleep(10, 'paused job', false);
    }

    return true;
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
      this.character.data = response.data.character;
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
      this.log.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move(contentLocation);
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
        this.log.error('Task response missing character data');
      }
    }
  }

  /**
   * @description Finds the relevant task master and hands in the task
   */
  async handInTask(taskType: TaskType) {
    if (taskType === 'monsters') {
      this.log.info(
        `Completed ${this.character.data.task_total} fights. Handing in task`,
      );
    } else if (taskType === 'items') {
      this.log.info(
        `Collected ${this.character.data.task_total} items. Handing in task`,
      );
    }
    return this.character.completeTask(taskType);
  }

  /**
   * @description Deposits gold into the bank if they have more than the specified amount
   * The amount that they can hold is relative to their level. The formula is
   * 3000 per character level. Anything over that gets deposited into the bank
   * @returns
   */
  protected async depositGoldIntoBank(): Promise<boolean> {
    const excessGold = this.character.excessGold;

    if (excessGold > 0) {
      return await this.character.depositNow(excessGold, 'gold');
    }

    return true;
  }
}
