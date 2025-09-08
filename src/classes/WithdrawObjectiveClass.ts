import { actionWithdrawItem } from '../api_calls/Actions';
import { actionUnequipItem } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { ItemSlot, UnequipSchema } from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class WithdrawObjective extends Objective {
  itemCode: string;
  quantity: number;

  constructor(character: Character, itemCode: string, quantity: number) {
    super(character, `withdraw_${quantity}_${itemCode}`, 'not_started');
    this.character = character;
    this.itemCode = itemCode;
    this.quantity = quantity;
  }

  async execute(): Promise<boolean> {
    this.startJob();
    await this.runSharedPrereqChecks();

    const result = await this.withdraw(this.quantity, this.itemCode);

    this.completeJob(result);
    this.character.removeJob(this);
    return result;
  }

  async runPrerequisiteChecks() {}

  /**
   * @description withdraw the specified items from the bank
   */
  async withdraw(quantity: number, itemCode: string, maxRetries: number = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Withdraw attempt ${attempt}/${maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = (await getMaps(undefined, 'bank')).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return true;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      const response = await actionWithdrawItem(this.character.data, [
        { quantity: quantity, code: itemCode },
      ]);

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === maxRetries) {
          logger.error(`Withdraw failed after ${attempt} attempts`);
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
