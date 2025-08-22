import { actionDepositItems, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';

export class DepositObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`deposit_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.status = 'in_progress';
    const result = await this.character.deposit(
      this.target.quantity,
      this.target.code,
    );
    this.status = 'complete';

    return result;
  }

  //async deposit() {
  // logger.info(`Finding location of the bank`);

  // const maps = (await getMaps(undefined, 'bank')).data;

  // if (maps.length === 0) {
  //   logger.error(`Cannot find the bank. This shouldn't happen ??`);
  //   return true;
  // }

  // const contentLocation = this.character.evaluateClosestMap(maps);

  // await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  // const response = await actionDepositItems(this.character.data, [
  //   { quantity: this.target.quantity, code: this.target.code },
  // ]);

  // if (response instanceof ApiError) {
  //   if (response.error.code === 499) {
  //     logger.warn(`Character is in cooldown. [Code: ${response.error.code}]`);
  //     await sleep(this.character.data.cooldown, 'cooldown');
  //   }
  // } else {
  //   this.character.data = response.data.character;
  // }
  // return true;
  //}
}
