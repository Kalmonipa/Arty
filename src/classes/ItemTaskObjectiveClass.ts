import { getMaps } from '../api_calls/Maps';
import { actionAcceptNewTask, actionCompleteTask } from '../api_calls/Tasks';
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

    const maps = (await getMaps(this.character.data.task, 'monster')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the task target. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

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
