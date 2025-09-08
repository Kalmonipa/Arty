import { actionUnequipItem } from '../api_calls/Items';
import { ItemSlot, UnequipSchema } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class UnequipObjective extends Objective {
  itemSlot: ItemSlot;
  quantity?: number;

  constructor(character: Character, itemSlot: ItemSlot, quantity?: number) {
    super(character, `unequip_${itemSlot}`, 'not_started');
    this.character = character;
    this.itemSlot = itemSlot;
    this.quantity = quantity;
  }

  async execute(): Promise<boolean> {
    this.startJob();
    await this.runSharedPrereqChecks();

    const result = await this.unequip(this.itemSlot, this.quantity);

    this.completeJob(result);
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {}

  /**
   * @description equip the item
   */
  async unequip(
    itemSlot: ItemSlot,
    quantity?: number,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Unequip attempt ${attempt}/${maxRetries}`);

      if (!quantity) quantity = 1;

      // validations
      if (
        (itemSlot === 'utility1' || itemSlot === 'utility2') &&
        quantity > 100
      ) {
        logger.warn(
          `Quantity can only be provided for utility slots and must be less than 100`,
        );
        return;
      }

      logger.info(`Unequipping ${itemSlot} slot`);

      const unequipSchema: UnequipSchema = {
        slot: itemSlot,
        quantity: quantity,
      };

      const response = await actionUnequipItem(
        this.character.data,
        unequipSchema,
      );
      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === maxRetries) {
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
