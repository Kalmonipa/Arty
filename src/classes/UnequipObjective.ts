import { actionUnequipItem } from '../api_calls/Items';
import { ItemSlot, UnequipSchema } from '../types/types';
import { logger } from '../utils';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';

export class UnequipObjective extends Objective {
  itemSlot: ItemSlot;
  quantity?: number;

  constructor(character: Character, itemSlot: ItemSlot, quantity?: number) {
    super(character, `unequip_${itemSlot}`, 'not_started');
    this.character = character;
    this.itemSlot = itemSlot;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description equip the item
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      logger.debug(`Unequip attempt ${attempt}/${this.maxRetries}`);

      if (!this.quantity) this.quantity = 1;

      // validations
      if (
        (this.itemSlot === 'utility1' || this.itemSlot === 'utility2') &&
        this.quantity > 100
      ) {
        logger.warn(
          `Quantity can only be provided for utility slots and must be less than 100`,
        );
        return;
      }

      logger.info(`Unequipping ${this.itemSlot} slot`);

      const unequipSchema: UnequipSchema = {
        slot: this.itemSlot,
        quantity: this.quantity,
      };

      const response = await actionUnequipItem(
        this.character.data,
        unequipSchema,
      );
      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Unequip failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        this.character.data = response.data.character;
      }
    }
  }
}
