import { actionCraft, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { getItemInformation } from '../api_calls/Items';
import { ItemSchema } from '../types/types';

export class CraftObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute() {
    const targetItem = await getItemInformation(this.target.code);

    if (targetItem instanceof ApiError) {
      logger.warn(
        `${targetItem.error.message} [Code: ${targetItem.error.code}]`,
      );
      if (targetItem.error.code === 499) {
        await sleep(5);
      }
      return true;
    }
    if (!targetItem.craft) {
      logger.warn(`Item has no craft information`);
      return true;
    }

    const maps = (await getMaps(targetItem.craft.skill, 'workshop')).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps to craft ${this.target.code}`);
      return true;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    logger.info(
      `Crafting ${this.target.quantity} ${this.target.code} at x: ${this.character.data.x}, y: ${this.character.data.y}`,
    );

    const response = await actionCraft(this.character.data, {
      code: this.target.code,
      quantity: this.target.quantity,
    });

    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(5);
      }
      return true;
    }

    this.character.data = response.data.character;

    logger.info(
      `Successfully crafted ${this.target.quantity} ${this.target.code}s`,
    );

    return true;
  }
}
