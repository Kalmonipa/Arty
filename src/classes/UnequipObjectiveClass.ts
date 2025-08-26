import { actionUnequipItem } from '../api_calls/Items';
import { ItemSlot, UnequipSchema } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class UnequipObjective extends Objective {
  character: Character;
  itemSlot: ItemSlot;
  quantity?: number;

  constructor(character: Character, itemSlot: ItemSlot, quantity?: number) {
    super(`unequip_${itemSlot}`, 'not_started');
    this.character = character;
    this.itemSlot = itemSlot;
    this.quantity = quantity;
  }

  async execute(): Promise<boolean> {
    this.startJob();
    const result = await this.character.unequip(this.itemSlot, this.quantity);
    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  // async unequip(itemSlot: ItemSlot, quantity?: number): Promise<boolean> {
  //   if (!quantity) quantity = 1;

  //   // validations
  //   if (
  //     (itemSlot === 'utility1' || itemSlot === 'utility2') &&
  //     quantity > 100
  //   ) {
  //     logger.warn(
  //       `Quantity can only be provided for utility slots and must be less than 100`,
  //     );
  //     return;
  //   }

  //   logger.info(`Unequipping ${itemSlot} slot`);

  //   const unequipSchema: UnequipSchema = {
  //     slot: itemSlot,
  //     quantity: quantity,
  //   };

  //   const response = await actionUnequipItem(
  //     this.character.data,
  //     unequipSchema,
  //   );
  //   if (response instanceof ApiError) {
  //     logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
  //     if (response.error.code === 499) {
  //       await sleep(this.character.data.cooldown, 'cooldown');
  //     }
  //   } else {
  //     this.character.data = response.data.character;
  //   }
  // }
}
