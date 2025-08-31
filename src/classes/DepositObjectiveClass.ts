import { actionDepositItems, actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';
import { ObjectiveTargets } from '../types/ObjectiveData';
import { BankItemTransaction } from '../types/BankData';
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

  async execute(): Promise<boolean> {
    this.startJob();

    this.runPrerequisiteChecks();

    const result = await this.deposit(this.target.quantity, this.target.code);
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
   * @description deposit the specified items into the bank
   * If itemCode is 'all', the inventory is emptied into the bank
   * If 0 is entered, all of the specified item is deposited
   */
  async deposit(
    quantity: number,
    itemCode: string,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.debug(`Deposit attempt ${attempt}/${maxRetries}`);

      logger.debug(`Finding location of the bank`);

      const maps = (await getMaps(undefined, 'bank')).data;

      if (maps.length === 0) {
        logger.error(`Cannot find the bank. This shouldn't happen ??`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      var response: ApiError | BankItemTransactionResponseSchema;
      if (itemCode === 'all') {
        var itemsToDeposit: SimpleItemSchema[] = [];

        for (var i = 0; i < this.character.data.inventory.length; i++) {
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
      } else if (quantity === 0) {
        response = await actionDepositItems(this.character.data, [
          {
            quantity: this.character.checkQuantityOfItemInInv(itemCode),
            code: itemCode,
          },
        ]);
      } else {
        response = await actionDepositItems(this.character.data, [
          { quantity: quantity, code: itemCode },
        ]);
      }

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || attempt === maxRetries) {
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
