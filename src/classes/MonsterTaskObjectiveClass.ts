import { getMaps } from '../api_calls/Maps';
import { actionAcceptNewTask, actionCompleteTask } from '../api_calls/Tasks';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class MonsterTaskObjective extends Objective {
  type: 'monster';

  constructor(character: Character) {
    super(character, `task_1_monstertask`, 'not_started');

    this.character = character;
  }

  // ToDo:
  //  - If 3 fights lost, cancel job. We don't want to keep losing fights
  async execute(): Promise<boolean> {
    var result: boolean = false;
    await this.runSharedPrereqChecks();

    if (this.character.data.task === '') {
      this.startNewTask('monsters');
    }

    const maps = (await getMaps(this.character.data.task, 'monster')).data;

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
    this.completeJob(result);
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {}
}
