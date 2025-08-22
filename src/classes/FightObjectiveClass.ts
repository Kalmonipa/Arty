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
    this.status = 'in_progress';
    const result = await this.character.fight(
      this.target.quantity,
      this.target.code,
    );
    this.status = 'complete';

    return result;
  }

  //   logger.info(`Finding location of ${this.target.code}`);

  //   const maps = (await getMaps(this.target.code)).data;

  //   if (maps.length === 0) {
  //     logger.error(`Cannot find any maps for ${this.target.code}`);
  //     return true;
  //   }

  //   const contentLocation = this.character.evaluateClosestMap(maps);

  //   await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  //   for (var count = 0; count < this.target.quantity; count++) {
  //     logger.info(
  //       `Fought ${count}/${this.target.quantity} ${this.target.code}s`,
  //     );

  //     // Check inventory space to make sure we are less than 90% full
  //     await this.character.evaluateDepositItemsInBank();

  //     const healthStatus: HealthStatus = this.character.checkHealth();

  //     if (healthStatus.percentage !== 100) {
  //       if (healthStatus.difference < 300) {
  //         await this.character.rest();
  //       } //else {
  //       // Eat food
  //       //}
  //     }

  //     const response = await actionFight(this.character.data);

  //     if (response instanceof ApiError) {
  //       logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
  //       if (response.error.code === 499) {
  //         await sleep(this.character.data.cooldown, 'cooldown');
  //       }
  //       return true;
  //     }

  //     this.character.data = response.data.character;
  //   }

  //   logger.info(
  //     `Successfully fought ${this.target.quantity} ${this.target.code}s`,
  //   );

  //   return true;
  // }
}
