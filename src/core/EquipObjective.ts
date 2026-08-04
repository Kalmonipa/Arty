import { actionEquipItem } from '../api_calls/Items.js';
import { EquipSchema, ItemSlot } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveCancelled, ObjectiveCompleted, ObjectiveResult } from '../types/ObjectiveData.js';

/**
 * Equips the specified item into the specified slot
 */
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
    this.jobFlavour = 'Equip';
    this.itemCode = itemCode;
    this.itemSlot = itemSlot;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description equip the item
   */
  async run(): Promise<ObjectiveResult> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      logger.debug(`Equip attempt ${attempt}/${this.maxRetries}`);

      if (!this.quantity) this.quantity = 1;

      if (
        (this.itemSlot === 'utility1' || this.itemSlot === 'utility2') &&
        this.quantity > 100
      ) {
        logger.warn(
          `Quantity can only be provided for utility slots and must be less than 100`,
        );
        return { complete: true, success: false, reason: 'failed' };
      }

      if (this.character.checkQuantityOfItemInInv(this.itemCode) === 0) {
        logger.info(`Character not carrying ${this.itemCode}. Checking bank`);
        if (
          (await this.character.checkQuantityOfItemInBank(this.itemCode)) > 0
        ) {
          await this.character.withdrawNow(this.quantity || 1, this.itemCode);
        } else {
          logger.warn(`No potions found in bank. Not equipping anything`);
          return { complete: true, success: false, reason: 'failed' };
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

      // ToDo: Make this build an array of EquipSchema and call the equip endpoint once
      const response = await actionEquipItem(this.character.data, [
        equipSchema,
      ]);
      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Equip failed after ${attempt} attempts`);
          return { complete: true, success: false, reason: 'failed' };
        }
      } else {
        if (response.data.character) {
          this.character.data = response.data.character;
        } else {
          logger.error('Equip response missing character data');
        }
        return { complete: true, success: true, reason: 'complete' };
      }
    }
  }
}
