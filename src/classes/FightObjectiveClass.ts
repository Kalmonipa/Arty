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

  async execute(character: Character, target: ObjectiveTargets) {
    logger.info(`Finding location of ${target.code}`);

    const maps = (await getMaps(target.code)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${target.code}`);
      return true;
    }

    const contentLocation = character.evaluateClosestMap(maps);

    await character.move({ x: contentLocation.x, y: contentLocation.y });

    for (var count = 0; count < target.quantity; count++) {
      logger.info(`Fought ${count}/${target.quantity} ${target.code}s`);

      // Check inventory space to make sure we are less than 90% full
      this.character.evaluateDepositItemsInBank();

      const healthStatus: HealthStatus = character.checkHealth();

      if (healthStatus.percentage !== 100) {
        if (healthStatus.difference < 300) {
          await character.rest();
        } //else {
        // Eat food
        //}
      }

      const response = await actionFight(character.data);

      if (response instanceof ApiError) {
        logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
        if (response.error.code === 499) {
          await sleep(5);
        }
        return true;
      }

      character.data = response.data.character;
    }

    logger.info(`Successfully fought ${target.quantity} ${target.code}s`);

    return true;
  }
}
