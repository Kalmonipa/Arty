import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { ApiError } from './Error.js';
import { getResourceInformation } from '../api_calls/Resources.js';
import { logger } from '../utils.js';
import { ActiveEventSchema } from '../types/types.js';
import { actionFight, actionGather } from '../api_calls/Actions.js';

/**
 * @description Performs the necessary steps to find and execute an event
 * Currently only supports resource events but will add more
 */
export class EventObjective extends Objective {
  activeEvent: ActiveEventSchema;

  constructor(character: Character, activeEvent: ActiveEventSchema) {
    super(character, `${activeEvent.code}_event`, 'not_started');

    this.character = character;
    this.activeEvent = activeEvent;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run() {
    switch (this.activeEvent.code) {
      case 'magic_apparition':
      case 'strange_apparition':
        return await this.gatherResources(this.activeEvent);
      case 'bandit_camp':
      case 'portal_demon':
      case 'corrupted_ogre':
        return await this.fightMobs(this.activeEvent);
      case 'fish_merchant':
        return await this.sellToFishMerchant(this.activeEvent);
      default:
        logger.info(`Event ${this.activeEvent.code} not configured yet.`);
        return false;
    }
  }

  /**
   * @description Function to respond to resource events
   */
  private async gatherResources(event: ActiveEventSchema): Promise<boolean> {
    const resourceInfoResponse = await getResourceInformation(
      event.map.interactions.content.code,
    );
    if (resourceInfoResponse instanceof ApiError) {
      return this.character.handleErrors(resourceInfoResponse);
    }

    const charSkillLevel = this.character.getCharacterLevel(
      resourceInfoResponse.data.skill,
    );
    const requiredLevel = resourceInfoResponse.data.level;

    if (charSkillLevel < requiredLevel) {
      logger.debug(`Not high enough level for ${event.code}`);
      return;
    }

    const expirationTime = new Date(event.expiration).getTime();
    while (Date.now() < expirationTime) {
      await this.character.evaluateGear(resourceInfoResponse.data.skill);

      await this.character.move(event.map);

      //const numToGather = this.character.data.inventory_max_items * 0.9;
      const numToGather = 10;

      // Only gathering 10 at a time to avoid attempting to gather after the event is over
      // ToDo: Put retry logic in here instead of just gathering 10 at a time
      for (let count = 0; count < numToGather; count++) {
        if (this.progress % 5 === 0) {
          logger.info(`Gathered ${this.progress}/${numToGather} ${event.code}`);
          // Check inventory space to make sure we are less than 90% full
          await this.character.evaluateDepositItemsInBank([], event.map);
        }

        const response = await actionGather(this.character.data);

        if (response instanceof ApiError) {
          return await this.character.handleErrors(response);
        } else {
          // Ensure response has the expected structure before accessing nested properties
          if (response && response.data && response.data.character) {
            this.character.data = response.data.character;
            this.progress++; // ToDo There might be edge cases where this doesn't reflect the actual gathered number
          } else {
            logger.error(
              'Invalid response structure from actionGather:',
              response,
            );
            return false;
          }
        }

        if (!(await this.checkStatus())) return false;

        await this.character.saveJobQueue();
      }
    }
  }

  /**
   * @description Fight the event mob
   */
  private async fightMobs(event: ActiveEventSchema): Promise<boolean> {
    if (!event.map.interactions.content) {
      logger.warn(`Event ${event.code} has no interactions content`);
      return false;
    }

    await this.character.evaluateGear(
      'combat',
      event.map.interactions.content.code,
    );
    const preferredWeapon = this.character.data.weapon_slot;

    const expirationTime = new Date(event.expiration).getTime();
    while (Date.now() < expirationTime) {
      const moveResult = await this.character.move(event.map);
      if (!moveResult) {
        logger.warn(`Move to ${event.code} failed`);
        return false;
      }

      // Check amount of food in inventory to use after battles
      if (!(await this.character.checkFoodLevels())) {
        await this.character.topUpFood(event.map);
      }

      await this.character.recoverHealth();

      // Check these after each fight in case we need to top up
      if (
        this.character.data.utility1_slot_quantity <=
        this.character.minEquippedUtilities
      ) {
        if (await this.character.equipUtility('restore', 'utility1')) {
          // If we moved to the bank we need to move back to the monster location
          await this.character.equipNow(preferredWeapon, 'weapon');
          await this.character.move(event.map);
        }
      }

      const response = await actionFight(this.character.data);

      if (response instanceof ApiError) {
        return await this.character.handleErrors(response);
      } else {
        if (response.data.characters) {
          const charData = response.data.characters.find(
            (char) => char.name === this.character.data.name,
          );

          this.character.data = charData;
        } else {
          logger.error('Fight response missing character data');
          return false;
        }
      }
    }

    return true;
  }

  /**
   * @description Sell specific items to an NPC
   * Currently only supports selling to the fish merchant
   * @todo Withdraw as much as we can at once to reduce travel time. Currently it withdraws and sells each item individually
   */
  private async sellToFishMerchant(event: ActiveEventSchema): Promise<boolean> {
    const itemsToSell = [
      'shell',
      'golden_shrimp',
      'holey_boot',
      'small_pearls',
    ];

    // Find any items in the bank
    for (const item of itemsToSell) {
      const numInBank = await this.character.checkQuantityOfItemInBank(item);
      if (numInBank > 0) {
        logger.info(`Attempting to sell ${numInBank} ${item} to Fish Merchant`);

        let numToWithdraw = numInBank;

        if (numToWithdraw > this.character.data.inventory_max_items) {
          numToWithdraw = Math.floor(
            this.character.data.inventory_max_items * 0.9,
          );
        }

        // Withdraw
        if (!(await this.character.withdrawNow(numToWithdraw, item))) {
          logger.warn(`Withdraw ${numToWithdraw} ${item} failed. Moving on`);
          continue;
        }

        // Sell items
        await this.character.tradeWithNpcNow('sell', numToWithdraw, item);
      }
    }

    await this.character.depositNow(0, 'gold');

    this.character.fishMerchantTradeDate = Math.round(Date.now() / 1000);

    return true;
  }
}
