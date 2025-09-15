import { actionWithdrawItem } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger } from '../utils';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';

export class WithdrawObjective extends Objective {
  itemCode: string;
  quantity: number;

  constructor(character: Character, itemCode: string, quantity: number) {
    super(character, `withdraw_${quantity}_${itemCode}`, 'not_started');
    this.character = character;
    this.itemCode = itemCode;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async run() {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      logger.debug(`Withdraw attempt ${attempt}/${this.maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = (await getMaps({content_type: 'bank'})).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return true;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      const response = await actionWithdrawItem(this.character.data, [
        { quantity: this.quantity, code: this.itemCode },
      ]);

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
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
