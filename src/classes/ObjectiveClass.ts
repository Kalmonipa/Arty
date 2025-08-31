import * as crypto from 'node:crypto';
import { ObjectiveStatus, ObjectiveTargets } from '../types/ObjectiveData';
import { Character } from './CharacterClass';
import { logger, sleep } from '../utils';
import { getMaps } from '../api_calls/Maps';
import { actionAcceptNewTask } from '../api_calls/Tasks';
import { ApiError } from './ErrorClass';

export abstract class Objective {
  character: Character;
  objectiveId: string;
  status: ObjectiveStatus;

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

  abstract execute(
    character: Character,
    target?: ObjectiveTargets,
  ): Promise<boolean>;

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
  completeJob() {
    logger.info(`Setting status of ${this.objectiveId} to 'complete'`);
    this.status = 'complete';
  }

  /**
   * @description Gets a new task from the specified task master
   * @returns
   */
  async startNewTask(taskType: string) {
    const maps = (await getMaps(taskType, 'tasks_master')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    const response = await actionAcceptNewTask(this.character.data);

    if (response instanceof ApiError) {
      if (response.error.code === 499) {
        logger.warn(`Character is in cooldown. [Code: ${response.error.code}]`);
        await sleep(this.character.data.cooldown, 'cooldown');
      }
      // ToDo: Handle this somehow
    } else {
      this.character.data = response.data.character;
    }
  }
}
