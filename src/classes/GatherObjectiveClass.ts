import { actionGather } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { getResourceInformation } from '../api_calls/Resources';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class GatherObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`gather_${target.quantity}_${target.code}`, 'not_started');
    this.character = character;
    this.target = target;
  }

  async execute() {
    var numHeld = this.character.checkQuantityOfItemInInv(this.target.code);
    logger.info(`${numHeld} ${this.target.code} in inventory`);
    if (numHeld >= this.target.quantity) {
      logger.info(`There are already ${numHeld} in the inventory. Exiting`);
      return true;
    }
    const remainderToGather = this.target.quantity - numHeld;

    logger.info(`Finding resource map type for ${this.target.code}`);

    const resources = await getResourceInformation({
      query: { drop: this.target.code },
      url: '/resources',
    });

    logger.info(`Finding location of ${resources.data[0].code}`);

    const maps = (await getMaps(resources.data[0].code)).data;

    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${resources.data[0].code}`);
      return true;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move({ x: contentLocation.x, y: contentLocation.y });

    for (var count = 0; count < remainderToGather; count++) {
      if (count % 5 === 0) {
        numHeld = this.character.checkQuantityOfItemInInv(this.target.code);
        logger.info(
          `Gathered ${numHeld}/${this.target.quantity} ${this.target.code}`,
        );
      }
      const gatherResponse = await actionGather(this.character.data);

      if (gatherResponse instanceof ApiError) {
        logger.warn(
          `${gatherResponse.error.message} [Code: ${gatherResponse.error.code}]`,
        );
        if (gatherResponse.error.code === 499) {
          await sleep(5);
        }
        return true;
      }

      this.character.data = gatherResponse.data.character;
    }

    numHeld = this.character.checkQuantityOfItemInInv(this.target.code);
    if (numHeld >= this.target.quantity) {
      logger.info(
        `Successfully gathered ${this.target.quantity} ${this.target.code}s`,
      );
      return true;
    }
    return false;
  }
}
