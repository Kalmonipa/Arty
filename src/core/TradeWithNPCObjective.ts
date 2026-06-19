import { getMaps } from '../api_calls/Maps.js';
import {
  actionBuyItem,
  actionSellItem,
  getAllNpcItems,
} from '../api_calls/NPC.js';
import { TradeType } from '../types/NPCData.js';
import { NPCItem, SimpleItemSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { GatherObjective } from './GatherObjective.js';
import { ItemTaskObjective } from './ItemTaskObjective.js';
import { Objective } from './Objective.js';

/**
 * @description Objective to buy or sell goods from/to a trader. Automatically finds
 * the NPC to trade with
 * @param tradeType buy or sell
 * @param itemCode code to buy or sell
 * @param quantity amount to buy or sell
 */
export class TradeObjective extends Objective {
  tradeType: TradeType;
  itemCode: string;
  quantity: number;
  currency: string;

  constructor(
    character: Character,
    tradeType: TradeType,
    quantity: number,
    itemCode: string,
  ) {
    super(character, `${tradeType}_${quantity}_${itemCode}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Trade';
    this.tradeType = tradeType;
    this.itemCode = itemCode;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    const npcItems = await getAllNpcItems({ code: this.itemCode });

    if (npcItems instanceof ApiError) {
      return await this.character.handleErrors(npcItems);
    } else {
      if (this.tradeType === 'buy') {
        return await this.buyFromNpc(npcItems.data, {
          code: this.itemCode,
          quantity: this.quantity,
        });
      } else if (this.tradeType === 'sell') {
        return await this.sellToNpc(npcItems.data[0].npc, {
          code: this.itemCode,
          quantity: this.quantity,
        });
      }
    }

    return true;
  }

  /**
   * @description Find the NPC that trades the item and buy from them
   * @returns true if successful, false if not
   */
  async buyFromNpc(
    npcItems: NPCItem[],
    items: SimpleItemSchema,
  ): Promise<boolean> {
    // ToDo: make this iterate through all the NPCs in the list. Some might be better than others
    this.currency = npcItems[0].currency;
    const targetNpc = npcItems[0].npc;
    const buyPrice = npcItems[0].buy_price;

    if (!(await this.checkStatus())) return false;

    // Calculate crystals needed
    let currencyNeeded = this.quantity * buyPrice;

    const numInInv = this.character.checkQuantityOfItemInInv(this.currency);

    if (numInInv >= currencyNeeded) {
      logger.info(
        `${numInInv} ${this.currency} in inv. Purchasing ${this.quantity} ${this.itemCode}`,
      );
    } else if (numInInv < currencyNeeded) {
      currencyNeeded = currencyNeeded - numInInv;
      logger.info(
        `Only holding ${numInInv} ${this.currency}. Need ${currencyNeeded} more`,
      );

      // ToDo: If the currency is gold checkQuantityOfItemInBank() doesn't work
      // Need to make a checkQuantityOfGoldInBank() function
      const numInBank = await this.character.checkQuantityOfItemInBank(
        this.currency,
      );
      logger.info(
        `Found ${numInBank}/${currencyNeeded} ${this.currency} in the bank to trade with`,
      );
      if (numInBank >= currencyNeeded) {
        await this.character.withdrawNow(currencyNeeded, this.currency);
      } else if (this.currency === 'tasks_coin') {
        let taskAttempts = 0;
        const maxTaskAttempts = 20;

        while (
          (await this.character.checkQuantityOfItemInBank(this.currency)) <
            currencyNeeded &&
          taskAttempts < maxTaskAttempts
        ) {
          if (!(await this.checkStatus())) return false;
          taskAttempts++;
          await this.character.executeJobNow(
            new ItemTaskObjective(this.character, 1),
            true,
            true,
            this.objectiveId,
          );
        }

        if (taskAttempts >= maxTaskAttempts) {
          logger.warn(
            `Reached maximum task attempts (${maxTaskAttempts}) for ${this.currency}`,
          );
          return false;
        }
      } else {
        logger.info(`Attempting to gather ${this.currency}`);
        await this.character.executeJobNow(
          new GatherObjective(this.character, {
            code: this.currency,
            quantity: currencyNeeded,
          }),
        );
      }
    }

    const numCurrInInv = this.character.checkQuantityOfItemInInv(this.currency);
    if (numCurrInInv < currencyNeeded) {
      const numInBank = await this.character.checkQuantityOfItemInBank(
        this.currency,
      );
      if (numInBank < currencyNeeded - numCurrInInv) {
        logger.warn(
          `Our collected ${this.currency} have gone missing. Only ${numInBank} in the bank`,
        );
        return false;
      }
      logger.info(
        `Only ${numCurrInInv} in inventory. Withdrawing ${currencyNeeded - numCurrInInv} ${this.currency} from bank`,
      );
      await this.character.withdrawNow(
        currencyNeeded - numCurrInInv,
        this.currency,
      );
    }

    await this.findNpc(targetNpc);

    const buyResponse = await actionBuyItem(this.character.data, items);
    if (buyResponse instanceof ApiError) {
      return this.character.handleErrors(buyResponse);
    } else {
      this.character.data = buyResponse.data.character;
      return true;
    }
  }

  /**
   * @description Sells to the NPC. The char must already be on the same map as the NPC
   */
  async sellToNpc(npcCode: string, items: SimpleItemSchema): Promise<boolean> {
    await this.findNpc(npcCode);

    logger.info(`Selling ${items.quantity} ${items.code} to ${npcCode}`);
    const sellResponse = await actionSellItem(this.character.data, items);
    if (sellResponse instanceof ApiError) {
      return this.character.handleErrors(sellResponse);
    } else {
      this.character.data = sellResponse.data.character;
      return true;
    }
  }

  /**
   * @description Find and move to NPC
   */
  async findNpc(npcCode: string) {
    logger.info(`Finding location of ${npcCode}`);
    // ToDo: From here down to this.evaluateClosestMap() is repeated a lot
    // Make it into it's own function and just call it
    const maps = await getMaps({
      content_code: npcCode,
      content_type: 'npc',
    });
    if (maps instanceof ApiError) {
      return await this.character.handleErrors(maps);
    }

    if (maps.data.length === 0) {
      logger.error(`Cannot find any maps for ${npcCode}`);
      return false;
    }

    const traderLocation = this.character.evaluateClosestMap(maps.data);

    await this.character.move(traderLocation);
  }
}
