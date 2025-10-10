import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import {
  actionWithdrawGold,
  getBankDetails,
  getBankItems,
  purchaseBankExpansion,
} from '../api_calls/Bank.js';
import { getMaps } from '../api_calls/Maps.js';

export class ExpandBankObjective extends Objective {
  constructor(character: Character) {
    super(character, `expand_bank`, 'not_started');

    this.character = character;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Calculates whether we should expand the bank and also if we are able too
   * Purchases a bank expansion if the requirements are met
   */
  async run(): Promise<boolean> {
    const maxBankFullness = 90;
    const targetPercentageLeftoverCash = 25;

    const currentBankFullness = await getBankItems();
    if (currentBankFullness instanceof ApiError) {
      await this.character.handleErrors(currentBankFullness);
      return false;
    }

    const bankDetails = await getBankDetails();
    if (bankDetails instanceof ApiError) {
      await this.character.handleErrors(bankDetails);
      return false;
    }

    // Check if the bank is >90% full
    if (
      Math.floor(bankDetails.data.slots / currentBankFullness.total) * 100 <
      maxBankFullness
    ) {
      logger.debug(`Bank is less than 90% full so no need to upgrade`);
      // Returning true because technically the job completed
      return true;
    }

    // Check if we have enough gold to purchase
    const leftoverGold =
      bankDetails.data.gold - bankDetails.data.next_expansion_cost;
    if (
      bankDetails.data.gold * (targetPercentageLeftoverCash / 100) >
      leftoverGold
    ) {
      logger.debug(
        `Purchasing an upgrade wouldn't leave us with ${leftoverGold}. Not purchasing`,
      );
      return true;
    }

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

    const withdrawGold = await actionWithdrawGold(
      this.character.data,
      bankDetails.data.next_expansion_cost,
    );
    if (withdrawGold instanceof ApiError) {
      await this.character.handleErrors(withdrawGold);
      return false;
    }

    const upgradeBank = await purchaseBankExpansion(this.character.data);
    if (upgradeBank instanceof ApiError) {
      await this.character.handleErrors(upgradeBank);
      return false;
    }

    return true;
  }
}
