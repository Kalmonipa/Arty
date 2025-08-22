import { actionEquipItem } from '../api_calls/Items';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { EquipSchema, ItemSlot } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class EquipObjective extends Objective {
  character: Character;
  itemName: string;
  itemSlot: ItemSlot;
  quantity?: number;

  constructor(
    character: Character,
    itemName: string,
    itemSlot: ItemSlot,
    quantity?: number,
  ) {
    super(`equip_${itemName}_${itemSlot}`, 'not_started');
    this.character = character;
    this.itemName = itemName;
    this.itemSlot = itemSlot;
    this.quantity = quantity;
  }

  async execute(): Promise<boolean> {
    return await this.equip(this.itemName, this.itemSlot, this.quantity);
  }

  async equip(
    itemName: string,
    itemSlot: ItemSlot,
    quantity?: number,
  ): Promise<boolean> {
    if (!quantity) quantity = 1;

    if (
      (itemSlot === 'utility1' || itemSlot === 'utility2') &&
      quantity > 100
    ) {
      logger.warn(
        `Quantity can only be provided for utility slots and must be less than 100`,
      );
      return;
    }

    logger.info(`Equipping ${quantity} ${itemName} into ${itemSlot}`);

    const equipSchema: EquipSchema = {
      code: itemName,
      slot: itemSlot,
      quantity: quantity,
    };

    const response = await actionEquipItem(this.character.data, equipSchema);
    if (response instanceof ApiError) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
      if (response.error.code === 499) {
        await sleep(this.character.data.cooldown, 'cooldown');
      }
    } else {
      this.character.data = response.data.character;
    }
  }
}
