import { actionWithdrawItem } from '../api_calls/Actions';
import { actionUnequipItem } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { ItemSlot, UnequipSchema } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class WithdrawObjective extends Objective {
  character: Character;
  itemCode: string;
  quantity: number;

  constructor(character: Character, itemCode: string, quantity: number) {
    super(`withdraw_${quantity}_${itemCode}`, 'not_started');
    this.character = character;
    this.itemCode = itemCode;
    this.quantity = quantity;
  }

  async execute(): Promise<boolean> {
    this.startJob();
    const result = await this.character.withdraw(this.quantity, this.itemCode);
    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  // This function has been moved to the Character class
  // async withdraw(quantity: number, itemCode: string): Promise<boolean> {
  //   logger.info(`Finding location of the bank`);

  //   const maps = (await getMaps(undefined, 'bank')).data;

  //   if (maps.length === 0) {
  //     logger.error(`Cannot find the bank. This shouldn't happen ??`);
  //     return true;
  //   }

  //   const contentLocation = this.character.evaluateClosestMap(maps);

  //   await this.character.move({ x: contentLocation.x, y: contentLocation.y });

  //   const response = await actionWithdrawItem(this.character.data, [
  //     { quantity: quantity, code: itemCode },
  //   ]);

  //   if (response instanceof ApiError) {
  //     logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
  //     if (response.error.code === 499) {
  //       await sleep(this.character.data.cooldown, 'cooldown');
  //     }
  //   } else {
  //     this.character.data = response.data.character;
  //   }
  //   return true;
  // }
}
