import { getItemInformation } from '../api_calls/Items.js';
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
import { MonsterTaskObjective } from './MonsterTaskObjective.js';
import { Objective } from './Objective.js';

/**
 * @description Objective to buy or sell goods from/to a trader
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
    this.tradeType = tradeType;
    this.itemCode = itemCode;
    this.quantity = quantity;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    // Figure out who trades the item
    const npcItems = await getAllNpcItems({ code: this.itemCode });

    if (npcItems instanceof ApiError) {
      return await this.character.handleErrors(npcItems);
    } else {
      if (this.tradeType === 'buy') {
        // Buy/sell that amount using buyFromNPC or sellToNPC
        return await this.buyFromNpc(npcItems.data, {
          code: this.itemCode,
          quantity: this.quantity,
        });
      } else if (this.tradeType === 'sell') {
        logger.warn(`Sell to NPC not implemented yet`);
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

      const numInBank = await this.character.checkQuantityOfItemInBank(
        this.currency,
      );
      if (numInBank >= currencyNeeded) {
        await this.character.withdrawNow(currencyNeeded, this.currency);
      } else if (this.currency === 'tasks_coin') {
        while (
          this.character.checkQuantityOfItemInInv(this.currency) <
          currencyNeeded
        )
          if (Math.floor(Math.random() * 2) === 0) {
            await this.character.executeJobNow(
              new MonsterTaskObjective(this.character, 1),
              true,
              true,
              this.objectiveId,
            );
          } else {
            await this.character.executeJobNow(
              new ItemTaskObjective(this.character, 1),
              true,
              true,
              this.objectiveId,
            );
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
   * @description Find the NPC and sell to them
   */
  async sellToNpc(npcCode: string, items: SimpleItemSchema): Promise<boolean> {
    await this.findNpc(npcCode);

    const sellResponse = await actionSellItem(this.character.data, items);
    if (sellResponse instanceof ApiError) {
      return this.character.handleErrors(sellResponse);
    } else {
      this.character.data = sellResponse.character;
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

    await this.character.move({ x: traderLocation.x, y: traderLocation.y });
  }
}
