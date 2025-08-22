import { actionGather } from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { getResourceInformation } from '../api_calls/Resources';
import { SimpleMapSchema } from '../types/MapData';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { DestinationSchema } from '../types/types';
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

  async execute(): Promise<boolean> {
    this.status = 'in_progress';
    const result = await this.character.gather(
      this.target.quantity,
      this.target.code,
    );
    this.status = 'complete';

    return result;
  }

  // async gather(): Promise<boolean> {
  //   var numHeld = this.character.checkQuantityOfItemInInv(this.target.code);
  //   logger.info(`${numHeld} ${this.target.code} in inventory`);
  //   if (numHeld >= this.target.quantity) {
  //     logger.info(`There are already ${numHeld} in the inventory. Exiting`);
  //     return true;
  //   }
  //   const remainderToGather = this.target.quantity - numHeld;

  //   // Check our equipment to see if we can equip something useful
  //   var resourceDetails = await getItemInformation(this.target.code);
  //   if (resourceDetails instanceof ApiError) {
  //     logger.info(resourceDetails.message);
  //     await sleep(this.character.data.cooldown, 'cooldown');
  //   } else {
  //     if (
  //       !(await this.character.checkWeaponForEffects(resourceDetails.subtype))
  //     ) {
  //       for (const item of this.character.data.inventory) {
  //         if (item.quantity > 0) {
  //           const itemInfo = await getItemInformation(item.code);
  //           if (itemInfo instanceof ApiError) {
  //             logger.warn(
  //               `${itemInfo.error.message} [Code: ${itemInfo.error.code}]`,
  //             );
  //           } else if (itemInfo.code === '') {
  //             logger.info(`No more items to check in inventory`);
  //           } else {
  //             for (const effect of itemInfo.effects) {
  //               if (effect.code === resourceDetails.subtype) {
  //                 await this.character.equip(item.code, 'weapon'); // ToDo: apparently this doesn't work
  //               }
  //             }
  //           }
  //         }
  //       }
  //       // ToDo:
  //       // - Search bank for suitable weapon. Can use /my/bank/items for this
  //       // - If no suitable weapon, maybe we just continue
  //       // - Extract this into it's own function?
  //     }
  //   }

  //   // Evaluate our inventory space before we start collecting items
  //   await this.character.evaluateDepositItemsInBank(this.target.code);

  //   logger.info(`Finding resource map type for ${this.target.code}`);

  //   const resources = await getResourceInformation({
  //     query: { drop: this.target.code },
  //     url: '/resources',
  //   });

  //   logger.info(`Finding location of ${resources.data[0].code}`);

  //   const maps = (await getMaps(resources.data[0].code)).data;

  //   if (maps.length === 0) {
  //     logger.error(`Cannot find any maps for ${resources.data[0].code}`);
  //     return true;
  //   }

  //   const contentLocation = this.character.evaluateClosestMap(maps);

  //   await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  //   await this.gatherItem(remainderToGather, {
  //     x: contentLocation.x,
  //     y: contentLocation.y,
  //   });

  //   numHeld = this.character.checkQuantityOfItemInInv(this.target.code);
  //   if (numHeld >= this.target.quantity) {
  //     logger.info(
  //       `Successfully gathered ${this.target.quantity} ${this.target.code}s`,
  //     );
  //     return true;
  //   }
  //   return false;
  // }

  // async gatherItem(remainderToGather: number, location: DestinationSchema) {
  //   // Loop that does the gather requests
  //   for (var count = 0; count < remainderToGather; count++) {
  //     if (count % 5 === 0) {
  //       this.numHeld = this.character.checkQuantityOfItemInInv(
  //         this.target.code,
  //       );
  //       logger.info(
  //         `Gathered ${this.numHeld}/${this.target.quantity} ${this.target.code}`,
  //       );
  //       // Check inventory space to make sure we are less than 90% full
  //       if (await this.character.evaluateDepositItemsInBank(this.target.code)) {
  //         // If items were deposited, we need to move back to the gathering location
  //         await this.character.move(location);
  //       }
  //     }

  //     const gatherResponse = await actionGather(this.character.data);

  //     if (gatherResponse instanceof ApiError) {
  //       logger.warn(
  //         `${gatherResponse.error.message} [Code: ${gatherResponse.error.code}]`,
  //       );
  //       if (gatherResponse.error.code === 499) {
  //         await sleep(this.character.data.cooldown, 'cooldown');
  //       }
  //     } else {
  //       this.character.data = gatherResponse.data.character;
  //     }
  //   }
  // }
}
