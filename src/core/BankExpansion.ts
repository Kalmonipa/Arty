import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import {
  actionWithdrawGold,
  getBankDetails,
  getBankItems,
  purchaseBankExpansion,
} from '../api_calls/Bank.js';
import { ObjectiveResult } from '../types/ObjectiveData.js';
import {
  cacheBankSlotsUsed,
  readCachedBankSlotsUsed,
} from './bankQuantityCache.js';

export class ExpandBankObjective extends Objective {
  constructor(character: Character) {
    super(character, `expand_bank`, 'not_started');

    this.character = character;
    this.jobFlavour = 'ExpandBank';
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description Calculates whether we should expand the bank and also if we are able too
   * Purchases a bank expansion if the requirements are met
   */
  async run(): Promise<ObjectiveResult> {
    const maxBankFullness = 90;
    const targetPercentageLeftoverCash = 25;

    const slotsUsed = await this.readSlotsUsed();
    if (slotsUsed === undefined) {
      return { complete: true, success: false, reason: 'failed' };
    }

    const bankDetails = await getBankDetails();
    if (bankDetails instanceof ApiError) {
      await this.character.handleErrors(bankDetails);
      return { complete: true, success: false, reason: 'failed' };
    }

    if (bankDetails.data.slots <= 0) {
      logger.warn(
        `Bank reports ${bankDetails.data.slots} slots; not upgrading`,
      );
      return { complete: true, success: true, reason: 'complete' };
    }

    const fullnessPercent = (slotsUsed / bankDetails.data.slots) * 100;
    if (fullnessPercent < maxBankFullness) {
      logger.debug(
        `Bank is ${fullnessPercent.toFixed(0)}% full (${slotsUsed}/${bankDetails.data.slots}) so no need to upgrade`,
      );
      // Returning true because technically the job completed
      return { complete: true, success: true, reason: 'complete' };
    }

    // Check if we have enough gold to purchase
    const leftoverGold =
      bankDetails.data.gold - bankDetails.data.next_expansion_cost;
    if (
      bankDetails.data.gold * (targetPercentageLeftoverCash / 100) >
      leftoverGold
    ) {
      logger.debug(
        `Purchasing an upgrade would leave us with ${leftoverGold}. Not purchasing`,
      );
      return { complete: true, success: false, reason: 'complete' };
    }

    const maps = await this.character.getAvailableBanks();

    if (maps.length === 0) {
      logger.error(`Cannot find the bank. This shouldn't happen ??`);
      return { complete: true, success: false, reason: 'failed' };
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move(contentLocation);

    const withdrawGold = await actionWithdrawGold(
      this.character.data,
      bankDetails.data.next_expansion_cost,
    );
    if (withdrawGold instanceof ApiError) {
      await this.character.handleErrors(withdrawGold);
      return { complete: true, success: false, reason: 'failed' };
    }

    const upgradeBank = await purchaseBankExpansion(this.character.data);
    if (upgradeBank instanceof ApiError) {
      await this.character.handleErrors(upgradeBank);
      return { complete: true, success: false, reason: 'failed' };
    }

    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description How many bank slots are occupied, or undefined if the bank
   * could not be read. Asks for a single item because only the `total` is
   * wanted, and memoises it: a full bank calls this on every failed deposit.
   */
  private async readSlotsUsed(): Promise<number | undefined> {
    const cached = readCachedBankSlotsUsed();
    if (cached !== undefined) {
      return cached;
    }

    const response = await getBankItems(undefined, 1, 1);
    if (response instanceof ApiError) {
      await this.character.handleErrors(response);
      return undefined;
    }

    cacheBankSlotsUsed(response.total);
    return response.total;
  }
}
