import { actionDepositItems } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import {
  BankGoldTransactionResponseSchema,
  BankItemTransactionResponseSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { actionDepositGold } from '../api_calls/Bank.js';
import { ExpandBankObjective } from './BankExpansion.js';

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
    // Check if the bank can and should be expanded
    await this.character.executeJobNow(new ExpandBankObjective(this.character));

    // Deposit any gold they have in their inventory
    if (this.parentId && !this.parentId.includes('deposit_')) {
      await this.depositGoldIntoBank(5000);
    }

    return true;
  }

  /**
   * @description deposit the specified items into the bank
   * If itemCode is 'all', the inventory is emptied into the bank
   * If 0 is entered, all of the specified item is deposited
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

      logger.debug(`Deposit attempt ${attempt}/${this.maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = await getMaps({ content_type: 'bank' });
      if (maps instanceof ApiError) {
        return this.character.handleErrors(maps);
      }

      if (maps.data.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps.data);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      let response:
        | ApiError
        | BankItemTransactionResponseSchema
        | BankGoldTransactionResponseSchema;

      if (this.target.code === 'gold') {
        response = await actionDepositGold(
          this.character.data,
          this.target.quantity,
        );
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
        if (response.data.character) {
          this.character.data = response.data.character;
        } else {
          logger.error('Deposit response missing character data');
        }
      }
      return true;
    }
  }
}
