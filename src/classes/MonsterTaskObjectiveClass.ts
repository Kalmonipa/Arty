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
    await this.runPrerequisiteChecks();

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

    if (
      this.character.data.task_total - this.character.data.task_progress ===
      0
    ) {
      logger.info(
        `Completed ${this.character.data.task_total} fights. Handing in task`,
      );
      const maps = (await getMaps('monsters', 'tasks_master')).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
        return;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      const response = await actionCompleteTask(this.character.data);

      if (response instanceof ApiError) {
        if (response.error.code === 499) {
          logger.warn(
            `Character is in cooldown. [Code: ${response.error.code}]`,
          );
          await sleep(this.character.data.cooldown, 'cooldown');
        }
      } else {
        this.character.data = response.data.character;
      }
    }

    return true;
  }

  // async startNewTask() {
  //   const maps = (await getMaps('monsters', 'tasks_master')).data;

  //   if (maps.length === 0) {
  //     logger.error(`Cannot find the tasks master. This shouldn't happen ??`);
  //     return;
  //   }

  //   const contentLocation = this.character.evaluateClosestMap(maps);

  //   await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  //   const response = await actionAcceptNewTask(this.character.data);

  //   if (response instanceof ApiError) {
  //     if (response.error.code === 499) {
  //       logger.warn(`Character is in cooldown. [Code: ${response.error.code}]`);
  //       await sleep(this.character.data.cooldown, 'cooldown');
  //     }
  //     // ToDo: Handle this somehow
  //   } else {
  //     this.character.data = response.data.character;
  //   }
  // }

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
