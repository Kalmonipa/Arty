import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class MonsterTaskObjective extends Objective {
  type: 'monster';
  quantity: number;

  constructor(character: Character, quantity: number) {
    super(character, `task_${quantity}_monstertask`, 'not_started');

    this.character = character;
  }

  // ToDo:
  //  - If 3 fights lost, cancel job. We don't want to keep losing fights

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run() {
    let result = false;

    while (this.progress < this.quantity) {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        logger.info(`Monster task attempt ${attempt}/${this.maxRetries}`);

        result = await this.doTask();

        if (result) {
          this.progress++;
        }
      }
    }

    if (this.character.data.task_total === this.character.data.task_progress) {
      result = await this.handInTask('monsters');
    }

    return result;
  }

  private async doTask(): Promise<boolean> {
    if (this.character.data.task === '') {
      this.startNewTask('monsters');
    }

    const maps = await getMaps({
      content_code: this.character.data.task,
      content_type: 'monster',
    });
    if (maps instanceof ApiError) {
      return this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find the task target. This shouldn't happen ??`);
      return false;
    }

    const contentLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    const result = await this.character.fightNow(
      this.character.data.task_total - this.character.data.task_progress,
      this.character.data.task,
    );

    return result;
  }
}
