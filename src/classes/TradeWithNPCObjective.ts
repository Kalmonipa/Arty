import { getAllItemInformation } from '../api_calls/Items.js';
import { CraftSkill, ItemSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @description Objective to buy or sell goods from/to a trader
 * @param tradeType buy or sell
 * @param itemCode code to buy or sell
 * @param quantity amount to buy or sell
 */
export class TradeObjective extends Objective {
  tradeType: string;
  itemCode: string;
  quantity: number;

  constructor(
    character: Character,
    tradeType: string,
    itemCode: string,
    quantity: number,
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
    // Figure out who sells the item
    // Buy/sell that amount using buyFromNPC or sellToNPC
    // Create an instance of this job in the crafting/gathering objectives

    return true;
  }
}
