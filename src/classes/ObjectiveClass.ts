import * as crypto from 'node:crypto';
import { ObjectiveStatus, ObjectiveTargets } from '../types/ObjectiveData';
import { Character } from './CharacterClass';
import { logger } from '../utils';

export abstract class Objective {
  objectiveId: string;
  status: ObjectiveStatus;

  constructor(objectiveId: string, status: ObjectiveStatus) {
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
}
