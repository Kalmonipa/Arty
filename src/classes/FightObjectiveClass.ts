import { actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';

export class FightObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.startJob();

    await this.runPrerequisiteChecks();

    const result = await this.fight(this.target.quantity, this.target.code);

    this.completeJob();
    this.character.removeJob(this);
    return result;
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

  /**
   * @description Fight the requested amount of mobs
   * @todo Does this function need to return anything?
   */
  async fight(quantity: number, code: string, maxRetries: number = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Fight attempt ${attempt}/${maxRetries}`);

      logger.info(`Finding location of ${code}`);

      const maps = (await getMaps(code)).data;

      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${code}`);
        return true; // ToDo: Not sure if I want to return true, false or anything at all here
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      for (var count = 0; count < quantity; count++) {
        logger.info(`Fought ${count}/${quantity} ${code}s`);

        // Check inventory space to make sure we are less than 90% full
        if (await this.character.evaluateDepositItemsInBank(code)) {
          // If items were deposited, we need to move back to the gathering location
          await this.character.move(contentLocation);
        }

        const healthStatus: HealthStatus = this.character.checkHealth();

        if (healthStatus.percentage !== 100) {
          if (healthStatus.difference < 300) {
            await this.character.rest();
          } //else {
          // Eat food
          //}
        }

        const response = await actionFight(this.character.data);

        if (response instanceof ApiError) {
          const shouldRetry = await this.character.handleErrors(response);

          if (!shouldRetry || attempt === maxRetries) {
            logger.error(`Fight failed after ${attempt} attempts`);
            return false;
          }
          continue;
        } else {
          if (response.data.fight.result === 'loss') {
            logger.warn(
              `Fight was a ${response.data.fight.result}. Returned to ${response.data.character.x},${response.data.character.y}`,
            );
          } else if (response.data.fight.result === 'win') {
            logger.info(
              `Fight was a ${response.data.fight.result}. Gained ${response.data.fight.xp} exp and ${response.data.fight.gold} gold`,
            );
          }

          this.character.data = response.data.character;
        }
      }

      logger.debug(`Successfully fought ${quantity} ${code}`);

      return true;
    }
  }
}
