import { actionEquipItem } from '../api_calls/Items.js';
import { EquipSchema, ItemSlot } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class EquipObjective extends Objective {
  itemCode: string;
  itemSlot: ItemSlot;
  quantity?: number;

  constructor(
    character: Character,
    itemCode: string,
    itemSlot: ItemSlot,
    quantity?: number,
  ) {
    super(character, `equip_${itemCode}_${itemSlot}`, 'not_started');
    this.character = character;
    this.itemCode = itemCode;
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
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        //this.character.removeJob(this.objectiveId);
        return false;
      }

      logger.debug(`Equip attempt ${attempt}/${this.maxRetries}`);

      if (!this.quantity) this.quantity = 1;

      if (
        (this.itemSlot === 'utility1' || this.itemSlot === 'utility2') &&
        this.quantity > 100
      ) {
        logger.warn(
          `Quantity can only be provided for utility slots and must be less than 100`,
        );
        return;
      }

      if (this.character.checkQuantityOfItemInInv(this.itemCode) === 0) {
        logger.info(`Character not carrying ${this.itemCode}. Checking bank`);
        if (
          (await this.character.checkQuantityOfItemInBank(this.itemCode)) > 0
        ) {
          await this.character.withdrawNow(this.quantity | 1, this.itemCode);
        }
      }

      logger.info(
        `Equipping ${this.quantity} ${this.itemCode} into ${this.itemSlot}`,
      );

      const equipSchema: EquipSchema = {
        code: this.itemCode,
        slot: this.itemSlot,
        quantity: this.quantity,
      };

      const response = await actionEquipItem(this.character.data, equipSchema);
      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Equip failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        this.character.data = response.data.character;
        return true;
      }
    }
  }
}
