import * as crypto from 'node:crypto';
import { ObjectiveStatus, ObjectiveTargets } from '../types/ObjectiveData';
import { Character } from './CharacterClass';

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

  // ToDo: Add equip method
}
