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
    this.startJob();

    const result = await this.equip(
      this.itemName,
      this.itemSlot,
      this.quantity,
    );

    this.completeJob();
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {
    await this.character.cooldownStatus();

    if (this.character.jobList.indexOf(this) !== 0) {
      logger.info(
        `Current job (${this.objectiveId}) has ${this.character.jobList.indexOf(this)} preceding jobs. Moving focus to ${this.character.jobList[0].objectiveId}`,
      );
      await this.character.jobList[0].execute(this.character);
    }
  }

  /**
   * @description equip the item
   */
  async equip(
    itemCode: string,
    itemSlot: ItemSlot,
    quantity?: number,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Equip attempt ${attempt}/${maxRetries}`);

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

      if (this.character.checkQuantityOfItemInInv(itemCode) === 0) {
        logger.info(`Character not carrying ${itemCode}. Checking bank`)
        if (await this.character.checkQuantityOfItemInBank(itemCode) > 0) {
          await this.character.withdrawNow(quantity | 1, itemCode)
        }
      }

      logger.info(`Equipping ${quantity} ${itemCode} into ${itemSlot}`);

      const equipSchema: EquipSchema = {
        code: itemCode,
        slot: itemSlot,
        quantity: quantity,
      };

      const response = await actionEquipItem(this.character.data, equipSchema);
      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === maxRetries) {
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
