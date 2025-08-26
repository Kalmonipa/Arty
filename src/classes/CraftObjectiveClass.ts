import { actionCraft, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { getItemInformation } from '../api_calls/Items';
import { GatherObjective } from './GatherObjectiveClass';
import { FightObjective } from './FightObjectiveClass';

export class CraftObjective extends Objective {
  character: Character;
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(`craft_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async execute(): Promise<boolean> {
    this.startJob();

    await this.checkPrerequisiteJobs();

    if (this.character.jobList.indexOf(this) !== 0) {
      logger.info(
        `Current job has ${this.character.jobList.indexOf(this)} preceding jobs. Moving focus to them`,
      );
      await this.character.jobList[0].execute(this.character);
    }

    const result = await this.character.craft(
      this.target.quantity,
      this.target.code,
    );

    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  async checkPrerequisiteJobs() {
    // Get item crafting info
    // iterate through those items and create jobs for necessary gathering

    const response = await getItemInformation(this.target.code);

    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(this.character.data.cooldown, 'cooldown');
      }
    } else {
      for (const craftingItem of response.craft.items) {
        // check inventory
        const numInInv = this.character.checkQuantityOfItemInInv(
          craftingItem.code,
        );
        if (numInInv >= craftingItem.quantity) {
          logger.info(
            `${numInInv} ${craftingItem.code} in inventory already. No need to gather`,
          );
          continue;
        } else {
          this.character.prependJob(
            new GatherObjective(this.character, {
              code: craftingItem.code,
              quantity: craftingItem.quantity - numInInv,
            }),
          );
        }

        // ToDo: check bank
      }
    }
  }

  // This function has been moved to the Character class
  // async craft() {
  //       const targetItem = await getItemInformation(this.target.code);

  //   if (targetItem instanceof ApiError) {
  //     logger.warn(
  //       `${targetItem.error.message} [Code: ${targetItem.error.code}]`,
  //     );
  //     if (targetItem.error.code === 499) {
  //       await sleep(this.character.data.cooldown, 'cooldown');
  //     }
  //     return true;
  //   }
  //   if (!targetItem.craft) {
  //     logger.warn(`Item has no craft information`);
  //     return true;
  //   }

  //   const maps = (await getMaps(targetItem.craft.skill, 'workshop')).data;

  //   if (maps.length === 0) {
  //     logger.error(`Cannot find any maps to craft ${this.target.code}`);
  //     return true;
  //   }

  //   const contentLocation = this.character.evaluateClosestMap(maps);

  //   await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  //   logger.info(
  //     `Crafting ${this.target.quantity} ${this.target.code} at x: ${this.character.data.x}, y: ${this.character.data.y}`,
  //   );

  //   const response = await actionCraft(this.character.data, {
  //     code: this.target.code,
  //     quantity: this.target.quantity,
  //   });

  //   if (response instanceof ApiError) {
  //     logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
  //     if (response.error.code === 499) {
  //       await sleep(this.character.data.cooldown, 'cooldown');
  //     }
  //   } else {
  //     this.character.data = response.data.character;

  //     logger.info(
  //       `Successfully crafted ${this.target.quantity} ${this.target.code}s`,
  //     );
  //   }
  // }
}
