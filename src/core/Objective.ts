import * as crypto from 'node:crypto';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveOnHold,
  ObjectiveResult,
  ObjectiveStatus,
} from '../types/ObjectiveData.js';
import { Character } from '../character/CharacterClass.js';
import { logger, sleep } from '../utils.js';
import {
  jobActiveGauge,
  jobCompletionsCounter,
  jobDurationHistogram,
} from '../metrics.js';
import { actionAcceptNewTask, actionCancelTask } from '../api_calls/Tasks.js';
import { ApiError } from './Error.js';
import { SimpleItemSchema, Skill, TaskType } from '../types/types.js';
import { addToWishlist } from '../wishlist/functions.js';
import { WishlistRequest } from '../wishlist/types.js';
import { TasksCoin } from '../names.js';

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
  /**
   * When true, this job is parked onto the onHold queue if it raised any
   * blocking wishlist requests while running, and resumed once they're
   * fulfilled. Set on jobs that represent a resumable unit of work (e.g.
   * TrainCraftingSkillObjective); left false on nested helper jobs so the
   * requests bubble up to the owning job.
   */
  parkOnWishlistRequest: boolean = false;
  raisedBlockingRequest = false;

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

  async execute(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    // Check if parent job has been cancelled
    if (this.cancelIfParentIsCancelled()) {
      return ObjectiveCancelled;
    }

    this.startJob();

    // Start from a clean slate so only requests raised by this job's run park it
    if (this.parkOnWishlistRequest) {
      this.character.pendingWishlistRequests = [];
    }

    await this.runSharedPrereqChecks();
    let result = await this.runPrerequisiteChecks();
    // If prerequisite checks fail then we should stop the job
    if (result.success) {
      result = await this.run();
    } else {
      this.log.warn(
        `Prerequisite checks for ${this.objectiveId} failed. Stopping job`,
      );
    }

    // If this job wishlisted things it needs, park it (instead of completing)
    // so it resumes once those requests are fulfilled. Only jobs that opt in
    // park: nested helpers return 'on_hold' too, and parking them as well would
    // put every job in the chain on hold and clear the pending requests their
    // owning job still needs to wait on.
    if (
      this.parkOnWishlistRequest &&
      this.character.pendingWishlistRequests.length > 0
    ) {
      const parked = await this.character.parkJob(this);
      this.character.pendingWishlistRequests = [];
      if (parked) {
        return ObjectiveOnHold;
      }
    }

    this.completeJob(result.success);
    return result;
  }

  /**
   * @description Marks the job as parked on the onHold queue and clears its
   * active metric so it doesn't look like it's still running.
   */
  setOnHold() {
    this.log.info(`Setting status of ${this.objectiveId} to 'on_hold'`);
    this.status = 'on_hold';
    this.clearActiveMetric();
  }

  abstract run(): Promise<ObjectiveResult>;

  /**
   * @description Prerequisite checks that each job configures in their own class
   */
  abstract runPrerequisiteChecks(): Promise<ObjectiveResult>;

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
    if (this.character.checkQuantityOfItemInInv(TasksCoin) < 1) {
      if (!(await this.character.withdrawNow(1, TasksCoin)).success) {
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
    const maps = this.character.findMaps({
      content_code: taskType,
      content_type: 'tasks_master',
    });
    if (maps.length === 0) {
      this.log.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

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
  async handInTask(taskType: TaskType): Promise<ObjectiveResult> {
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
  protected async depositGoldIntoBank(): Promise<ObjectiveResult> {
    const excessGold = this.character.excessGold;

    if (excessGold > 0) {
      return await this.character.depositNow(excessGold, 'gold');
    }

    return ObjectiveCompleted;
  }

  /**
   * @description Adds a missing item to the wishlist and records it as a blocking
   * request so the root job gets parked until it's fulfilled. This is the single
   * entry point for "this character can't get this item": an item already
   * requested during this run is waited on again rather than requested twice.
   * @param overrides Details the caller knows better than they can be derived
   * from the item's data, e.g. the skill and level a fulfiller needs
   */
  async requestIngredientFromWishlist(
    craftingItem: SimpleItemSchema,
    overrides?: Pick<WishlistRequest, 'acquisitionMethod' | 'minLevel'>,
  ): Promise<void> {
    const alreadyRequested = await this.character.findOpenWishlistRequest(
      craftingItem.code,
    );
    if (alreadyRequested) {
      logger.info(
        `${this.character.data.name} already requested ${alreadyRequested.quantity} ${craftingItem.code} (#${alreadyRequested.requestId}); waiting on that instead of adding another`,
      );
      this.raisedBlockingRequest = true;
      return;
    }

    logger.info(
      `${this.character.data.name} can't obtain ${craftingItem.quantity} ${craftingItem.code}; adding to wishlist`,
    );
    const requestId = await addToWishlist({
      itemCode: craftingItem.code,
      quantity: craftingItem.quantity,
      characterName: this.character.data.name,
      ...overrides,
    });
    this.character.addBlockingWishlistRequest(
      requestId,
      craftingItem.code,
      craftingItem.quantity,
    );
    this.raisedBlockingRequest = true;
  }

  /**
   * Returns true if there is an instance of the specified job in the on hold queue
   */
  checkForJobInOnHoldQueue(jobType: Skill): boolean {
    const numCurrentJobsInQueue = this.character.onHold.filter((job) =>
      job.job.objectiveId.includes(jobType),
    ).length;
    if (numCurrentJobsInQueue > 2) {
      logger.info(`2 train ${jobType} jobs already on hold. Skipping`);
      return true;
    } else {
      return false;
    }
  }
}
