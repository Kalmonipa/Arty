import { getMaps } from '../api_calls/Maps';
import {
  actionAcceptNewTask,
  actionCompleteTask,
  actionTasksTrade,
} from '../api_calls/Tasks';
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
    await this.runPrerequisiteChecks();

    // Check if we have the item alread in inv and bank
    // Gather the required items

    if (this.character.data.task === '') {
      this.startNewTask('items');
    }

    while (this.character.data.task_progress < this.character.data.task_total) {
      // If we need to collect less than 80, gather that amount, otherwise gather 80
      var numToGather = Math.min(
        this.character.data.task_total - this.character.data.task_progress,
        80,
      );

      if (
        numToGather ===
        this.character.checkQuantityOfItemInInv(this.character.data.task)
      ) {
        await actionTasksTrade(
          this.character.data,
          this.character.data.task,
          numToGather,
        );
      }

      await this.character.gatherNow(numToGather, this.character.data.task);

      return true;
    }

    await this.handInTask('items');

    return true;
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
