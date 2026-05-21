import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { ApiError } from './Error.js';
import { getResourceInformation } from '../api_calls/Resources.js';
import { logger } from '../utils.js';
import {
  ActiveEventSchema,
  MapContentType,
  MapSchema,
  ResourceResponseSchema,
} from '../types/types.js';
import { actionFight, actionGather } from '../api_calls/Actions.js';
import { getItemInformation } from '../api_calls/Items.js';
import { getAllNpcItems, getNpc } from '../api_calls/NPC.js';

/**
 * @description Performs the necessary steps to find and execute an event
 * Currently only supports resource events but will add more
 */
export class EventObjective extends Objective {
  activeEvent: ActiveEventSchema;
  /**
   * @description The location of the character before the event started.
   * This is used to move back to once the event expires, to resume prior activities
   */
  previousLocation: MapSchema;
  /** Pre-fetched resource info passed in from checkForActiveEvents to avoid a duplicate API call. */
  resourceInfo?: ResourceResponseSchema;

  constructor(
    character: Character,
    activeEvent: ActiveEventSchema,
    previousLocation?: MapSchema,
  ) {
    super(character, `${activeEvent.code}_event`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Event';
    this.activeEvent = activeEvent;
    this.shouldEmitMetrics = true;
    this.metricLabel = activeEvent.code;
    if (previousLocation) {
      this.previousLocation = previousLocation;
    } else {
      this.previousLocation = this.character.allMaps.find(
        (map) => map.map_id === this.character.data.map_id,
      );
    }
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run() {
    let result: boolean;
    const contentType = this.activeEvent.map.interactions?.content?.type;

    if (contentType === MapContentType.resource) {
      result = await this.gatherResources(this.activeEvent);
    } else {
      switch (this.activeEvent.code) {
        case 'bandit_camp':
        case 'portal_demon':
        case 'corrupted_ogre':
        case 'corrupted_owlbear':
        case 'cult_of_darkness':
          result = await this.fightMobs(this.activeEvent);
          break;
        case 'fish_merchant':
          result = await this.sellToFishMerchant();
          break;
        case 'nomadic_merchant':
          result = await this.sellToNomadicMerchant();
          break;
        default:
          logger.info(`Event ${this.activeEvent.code} not configured yet.`);
          this.character.lastEventCheckTimestamp = Math.round(Date.now() / 1000);
          return false;
      }
    }

    if (result) {
      this.character.recordEventSuccess(this.activeEvent.code);
    }
    return result;
  }

  /**
   * @description Function to respond to resource events
   */
  private async gatherResources(event: ActiveEventSchema): Promise<boolean> {
    let resourceInfo = this.resourceInfo;

    if (!resourceInfo) {
      const response = await getResourceInformation(event.map.interactions.content.code);
      if (response instanceof ApiError) {
        return this.character.handleErrors(response);
      }
      resourceInfo = response;
    }

    const charSkillLevel = this.character.getCharacterLevel(
      this.character.data,
      resourceInfo.data.skill,
    );

    if (charSkillLevel < resourceInfo.data.level) {
      logger.debug(`Not high enough level for ${event.code}`);
      return false;
    }

    const expirationTime = new Date(event.expiration).getTime();
    while (Date.now() < expirationTime) {
      await this.character.evaluateGear(resourceInfo.data.skill);

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
   * @todo Determine if the character can fight the mob within this event rather than hardcoding in CheckForActiveEvents
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

      if (response.data.fight.result === 'loss') {
        this.character.recordEventFailure(event.code);
        return false;
      }
    }

    // Top up health pots after the event so that we're prepared for the next one
    await this.character.topUpHealthPots();

    return true;
  }

  private async sellToFishMerchant(): Promise<boolean> {
    const success = await this.sellToMerchant('fish_merchant');
    if (success) {
      this.character.fishMerchantTradeDate = Math.round(Date.now() / 1000);
    }
    return success;
  }

  private async sellToNomadicMerchant(): Promise<boolean> {
    const success = await this.sellToMerchant('nomadic_merchant');
    if (success) {
      await this.buyFromNomadicMerchant();
      this.character.nomadicMerchantTradeDate = Math.round(Date.now() / 1000);
    }
    return success;
  }

  /**
   * @description Buy a backpack (if bag slot is empty) and a lost_world_map
   * (if not already equipped, in inventory, or in bank) from the nomadic merchant.
   */
  private async buyFromNomadicMerchant(): Promise<void> {
    const npcResponse = await getNpc('nomadic_merchant');
    if (npcResponse instanceof ApiError) {
      logger.warn('Could not fetch nomadic_merchant details for purchase');
      return;
    }

    const buyableItems = (npcResponse.items ?? []).filter(
      (item) => item.buy_price != null,
    );

    if (!this.character.data.bag_slot) {
      for (const item of buyableItems) {
        const itemInfo = await getItemInformation(item.code);
        if (itemInfo instanceof ApiError) {
          logger.warn(`Could not get item info for ${item.code}, skipping`);
          continue;
        }
        if (itemInfo.type === 'bag') {
          logger.info(`Buying bag: ${item.code}`);
          await this.character.tradeWithNpcNow('buy', 1, item.code);
          break;
        }
      }
    }

    const mapForSale = buyableItems.find((item) => item.code === 'lost_world_map');
    if (mapForSale) {
      const equippedItems = [
        this.character.data.weapon_slot,
        this.character.data.rune_slot,
        this.character.data.shield_slot,
        this.character.data.helmet_slot,
        this.character.data.body_armor_slot,
        this.character.data.leg_armor_slot,
        this.character.data.boots_slot,
        this.character.data.ring1_slot,
        this.character.data.ring2_slot,
        this.character.data.amulet_slot,
        this.character.data.artifact1_slot,
        this.character.data.artifact2_slot,
        this.character.data.artifact3_slot,
        this.character.data.utility1_slot,
        this.character.data.utility2_slot,
        this.character.data.bag_slot,
      ];
      const isEquipped = equippedItems.includes('lost_world_map');
      const inInv = this.character.checkQuantityOfItemInInv('lost_world_map') > 0;
      const inBank = (await this.character.checkQuantityOfItemInBank('lost_world_map')) > 0;

      if (!isEquipped && !inInv && !inBank) {
        logger.info('Buying lost_world_map from nomadic merchant');
        await this.character.tradeWithNpcNow('buy', 1, 'lost_world_map');
      }
    }
  }

  /**
   * @description Sell items to a merchant NPC.
   * Items with both buy_price and sell_price are skipped (two-way tradeable — not worth selling).
   * Items with only a sell_price: keep 5 if equipment type (weapon/helmet/body_armor/ring),
   * keep all if utility or consumable, otherwise sell everything.
   */
  private async sellToMerchant(npcCode: string): Promise<boolean> {
    const keepEquipmentTypes = ['weapon', 'helmet', 'body_armor', 'ring'];
    const keepAllTypes = ['utility', 'consumable'];
    const keepQuantity = 5;

    const npcResponse = await getNpc(npcCode);
    if (npcResponse instanceof ApiError) {
      logger.error(`Could not fetch ${npcCode} details`);
      return false;
    }

    const sellableItems = (npcResponse.items ?? []).filter(
      (npcItem) => npcItem.sell_price != null && npcItem.buy_price == null,
    );

    for (const npcItem of sellableItems) {
      const numInBank = await this.character.checkQuantityOfItemInBank(npcItem.code);
      if (numInBank <= 0) continue;

      const itemInfoResponse = await getItemInformation(npcItem.code);
      if (itemInfoResponse instanceof ApiError) {
        logger.warn(`Could not get item info for ${npcItem.code}, skipping`);
        continue;
      }

      const itemType = itemInfoResponse.type;

      if (keepAllTypes.includes(itemType)) {
        logger.debug(`Keeping all ${numInBank} ${npcItem.code} (${itemType})`);
        continue;
      }

      let currencyReserve = 0;
      const currencyUsageResponse = await getAllNpcItems({ currency: npcItem.code, size: 10000 });
      if (currencyUsageResponse instanceof ApiError) {
        logger.warn(`Could not check currency usage for ${npcItem.code}, proceeding without reserve`);
      } else {
        const prices = currencyUsageResponse.data
          .map((item) => item.buy_price)
          .filter((price): price is number => price != null);
        if (prices.length > 0) {
          currencyReserve = Math.max(...prices);
          logger.debug(`Reserving ${currencyReserve} ${npcItem.code} for currency use`);
        }
      }

      const numAvailableToSell = numInBank - currencyReserve;
      if (numAvailableToSell <= 0) {
        logger.info(`Keeping all ${numInBank} ${npcItem.code} (reserved ${currencyReserve} for currency use)`);
        continue;
      }

      const numToSell = keepEquipmentTypes.includes(itemType)
        ? Math.max(0, numAvailableToSell - keepQuantity)
        : numAvailableToSell;

      if (numToSell <= 0) {
        logger.info(`Keeping all ${numInBank} ${npcItem.code} (need to keep at least ${keepQuantity})`);
        continue;
      }

      logger.info(`Attempting to sell ${numToSell} ${npcItem.code} to ${npcResponse.name}`);

      let numToWithdraw = numToSell;
      if (numToWithdraw > this.character.data.inventory_max_items) {
        numToWithdraw = Math.floor(this.character.data.inventory_max_items * 0.9);
      }

      if (!(await this.character.withdrawNow(numToWithdraw, npcItem.code))) {
        logger.warn(`Withdraw ${numToWithdraw} ${npcItem.code} failed. Moving on`);
        continue;
      }

      await this.character.tradeWithNpcNow('sell', numToWithdraw, npcItem.code);
    }

    await this.character.depositNow(0, 'gold');

    return true;
  }
}
