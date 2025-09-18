import { actionDepositItems } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { logger } from '../utils.js';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  BankItemTransactionResponseSchema,
  SimpleItemSchema,
} from '../types/types';

export class DepositObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `deposit_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description deposit the specified items into the bank
   * If itemCode is 'all', the inventory is emptied into the bank
   * If 0 is entered, all of the specified item is deposited
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        this.character.removeJob(this.objectiveId);
        return false;
      }

      logger.debug(`Deposit attempt ${attempt}/${this.maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = (await getMaps({content_type: 'bank'})).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      let response: ApiError | BankItemTransactionResponseSchema;
      if (this.target.code === 'gold') {
        logger.warn(`Deposit gold has not been implemented yet`);
        // deposit gold
      } else if (this.target.code === 'all') {
        const itemsToDeposit: SimpleItemSchema[] = [];

        for (let i = 0; i < this.character.data.inventory.length; i++) {
          if (this.character.data.inventory[i].code !== '') {
            itemsToDeposit.push({
              code: this.character.data.inventory[i].code,
              quantity: this.character.data.inventory[i].quantity,
            });
          }
        }
        response = await actionDepositItems(
          this.character.data,
          itemsToDeposit,
        );
      } else if (this.target.quantity === 0) {
        response = await actionDepositItems(this.character.data, [
          {
            quantity: this.character.checkQuantityOfItemInInv(this.target.code),
            code: this.target.code,
          },
        ]);
      } else {
        response = await actionDepositItems(this.character.data, [
          { quantity: this.target.quantity, code: this.target.code },
        ]);
      }

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === this.maxRetries) {
          logger.error(`Deposit failed after ${attempt} attempts`);
          return false;
        }
        continue;
      } else {
        this.character.data = response.data.character;
      }
      return true;
    }
  }
}
