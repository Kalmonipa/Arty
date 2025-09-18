import { getMaps } from '../api_calls/Maps';
import { logger } from '../utils.js';
import { Character } from './Character';
import { Objective } from './Objective';

export class MonsterTaskObjective extends Objective {
  type: 'monster';

  constructor(character: Character) {
    super(character, `task_1_monstertask`, 'not_started');

    this.character = character;
  }

  // ToDo:
  //  - If 3 fights lost, cancel job. We don't want to keep losing fights

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run() {
    let result = false;

    if (this.character.data.task === '') {
      this.startNewTask('monsters');
    }

    const maps = (await getMaps({content_code: this.character.data.task, content_type: 'monster'})).data;

    if (maps.length === 0) {
      logger.error(`Cannot find the task target. This shouldn't happen ??`);
      return;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    await this.character.fightNow(
      this.character.data.task_total - this.character.data.task_progress,
      this.character.data.task,
    );

    if (this.character.data.task_total === this.character.data.task_progress) {
      result = await this.handInTask('monsters');
    }

    return result;
  }
}
