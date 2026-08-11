import { estimateFightCooldown, logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { DepositObjective } from './DepositObjective.js';
import { FightSimulator } from '../fights/FightSimulator.js';
import { Objective } from './Objective.js';
import {
  MAX_MONSTER_TASK_SECONDS,
  MAX_TASK_REROLLS,
  MIN_TASK_COINS_TO_REROLL,
  TASK_ESTIMATE_SIM_ITERATIONS,
} from '../constants.js';
import { TasksCoin } from '../names.js';
import { ObjectiveCancelled, ObjectiveResult } from '../types/ObjectiveData.js';

export class MonsterTaskObjective extends Objective {
  type = 'monster' as const;
  quantity: number;

  constructor(character: Character, quantity: number) {
    super(character, `task_${quantity}_monsters`, 'not_started');

    this.character = character;
    this.jobFlavour = 'MonsterTask';
    this.quantity = quantity;
    this.shouldEmitMetrics = true;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  async run(): Promise<ObjectiveResult> {
    let result: ObjectiveResult = {
      complete: false,
      success: false,
      reason: 'in_progress',
    };

    while (this.progress < this.quantity) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        if (!(await this.checkStatus())) return ObjectiveCancelled;

        logger.info(`Monster task attempt ${attempt}/${this.maxRetries}`);

        result = await this.doTask();

        if (result.success) {
          this.progress++;
          break; // Exit the retry loop on success
        }

        // If we keep losing the fight, cancel the task rather than retrying an
        // unwinnable monster so the character can move on to different work
        if (this.character.lostTooManyFights) {
          logger.warn(
            `Lost too many fights against ${this.character.data.task}. Cancelling monster task`,
          );
          await this.cancelCurrentTask('monsters');
          break;
        }
      }

      // If we failed all retries, exit the main loop
      if (!result.success) {
        break;
      }
    }

    // Check if task is completed and hand it in
    if (this.character.data.task_total === this.character.data.task_progress) {
      result = await this.handInTask('monsters');
    }

    const numCoinsInInv = this.character.checkQuantityOfItemInInv(TasksCoin);
    await this.character.executeJobNow(
      new DepositObjective(this.character, {
        code: TasksCoin,
        quantity: numCoinsInInv,
      }),
      true,
      true,
      this.objectiveId,
    );

    return result;
  }

  private async doTask(): Promise<ObjectiveResult> {
    this.character.lostTooManyFights = false;

    if (!this.character.data.task || this.character.data.task === '') {
      await this.startNewTask('monsters');
    }

    // Check if task is completed and hand it in
    if (this.character.data.task_total === this.character.data.task_progress) {
      return { complete: true, success: true, reason: 'complete' };
    }

    // Without a task there's no target to look up, and an empty content_code
    // matches every monster map — so bail rather than fighting something random
    if (!this.character.data.task || this.character.data.task === '') {
      logger.warn(`No monster task to work on`);
      return { complete: true, success: false, reason: 'failed' };
    }

    await this.rerollTasksThatCostTooMuch();

    const result = await this.character.fightNow(
      this.character.data.task_total - this.character.data.task_progress,
      this.character.data.task,
    );

    return result;
  }

  /**
   * @description Swaps out a task that would cost more fighting time than it's
   * worth. A task against a slow monster is the same handful of coins for
   * several times the effort. Cancelling costs a coin, so the rerolls are capped
   * and stop while there are still coins left.
   */
  private async rerollTasksThatCostTooMuch(): Promise<void> {
    for (let reroll = 0; reroll <= MAX_TASK_REROLLS; reroll++) {
      const estimate = await this.estimateRemainingTaskSeconds();

      if (estimate !== null && estimate <= MAX_MONSTER_TASK_SECONDS) {
        logger.info(
          `Task of ${this.remainingFights()} ${this.character.data.task} should take ${(estimate / 3600).toFixed(1)}h. Getting on with it`,
        );
        return;
      }

      const reason =
        estimate === null
          ? `can't be won`
          : `would take ${(estimate / 3600).toFixed(1)}h (max ${MAX_MONSTER_TASK_SECONDS / 3600}h)`;

      if (reroll === MAX_TASK_REROLLS) {
        logger.warn(
          `Task of ${this.remainingFights()} ${this.character.data.task} ${reason}, but ${MAX_TASK_REROLLS} rerolls is enough. Keeping it`,
        );
        return;
      }

      if (!(await this.canAffordToReroll(estimate === null))) {
        logger.warn(
          `Task of ${this.remainingFights()} ${this.character.data.task} ${reason}, but there aren't enough ${TasksCoin} to reroll. Keeping it`,
        );
        return;
      }

      logger.info(
        `Task of ${this.remainingFights()} ${this.character.data.task} ${reason}. Cancelling for a new one`,
      );
      await this.cancelCurrentTask('monsters');
      await this.startNewTask('monsters');
    }
  }

  /**
   * @description How long the fights this task still needs would take. Uses the
   * fight sim so the estimate follows the character's current gear rather than a
   * fixed table.
   * @returns the estimate in seconds, or null if the target can't be beaten
   */
  private async estimateRemainingTaskSeconds(): Promise<number | null> {
    const sim = new FightSimulator(
      this.character,
      [this.character.createFakeCharacterSchema(this.character.data)],
      this.character.data.task,
      TASK_ESTIMATE_SIM_ITERATIONS,
    );
    await this.character.executeJobNow(sim, true, true, this.objectiveId);

    if (sim.averageTurns <= 0) {
      return null;
    }

    return (
      this.remainingFights() *
      estimateFightCooldown(sim.averageTurns, this.character.data.haste)
    );
  }

  private remainingFights(): number {
    return this.character.data.task_total - this.character.data.task_progress;
  }

  /**
   * @description Whether we can spare the coin a cancel costs. A task we can't
   * win is a blocker rather than an expense: keeping it means losing fights until
   * the job gives up and cancels anyway, so it only has to cover the cancel
   * itself. A merely slow task still pays out, so that one leaves the reserve be.
   */
  private async canAffordToReroll(
    taskIsUnwinnable: boolean,
  ): Promise<boolean> {
    const coins =
      this.character.checkQuantityOfItemInInv(TasksCoin) +
      (await this.character.checkQuantityOfItemInBank(TasksCoin));

    return coins >= (taskIsUnwinnable ? 1 : MIN_TASK_COINS_TO_REROLL);
  }
}
