import {
  getAllItemInformation,
  getItemInformation,
} from '../api_calls/Items.js';
import {
  CraftSkill,
  DropRateSchema,
  GetAllItemsItemsGetParams,
  ItemSchema,
  MonsterSchema,
  NPCItemSchema,
} from '../types/types.js';
import { isEventContent } from '../events/events.cache.js';
import { getResourceNodesDropping } from '../api_calls/Resources.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { BankCache } from './BankCache.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import {
  Alchemy,
  Cooking,
  Gearcrafting,
  Jewelrycrafting,
  Mining,
  Weaponcrafting,
  Woodcutting,
} from '../names.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

/**
 * @description Trains the desired crafting skill until reaching the desired level
 * Crafts 1 item at a time
 */
export class TrainCraftingSkillObjective extends Objective {
  skill: CraftSkill;
  targetLevel: number;
  /**
   * Range within the character level that they should craft. Defaults to 9
   * so that skill level 29 will craft lvl 20-29 items, skill level 30 will only
   * craft lvl 21-30 items
   */
  levelRange?: number;

  constructor(
    character: Character,
    skill: CraftSkill,
    targetLevel: number,
    levelRange?: number,
  ) {
    super(character, `train_${targetLevel}_${skill}`, 'not_started');
    this.character = character;
    this.jobFlavour = 'TrainCraftingSkill';
    this.targetLevel = targetLevel;
    this.skill = skill;
    this.levelRange = levelRange ?? 9;
    this.shouldEmitMetrics = true;
    this.metricLabel = skill;
    // If an ingredient must come from another role, wishlist it and park this
    // job until it's fulfilled rather than failing the craft outright.
    this.parkOnWishlistRequest = true;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async run(): Promise<ObjectiveResult> {
    let charLevel = this.character.getCharacterLevel(
      this.character.data,
      this.skill,
    );

    let numToCraft: number;
    switch (this.skill) {
      case Alchemy:
      case Cooking:
      case Mining:
      case Woodcutting:
        numToCraft = 10;
        break;
      case Weaponcrafting:
      case Gearcrafting:
      case Jewelrycrafting:
        numToCraft = 5;
        break;
      default:
        numToCraft = 1;
    }

    while (charLevel < this.targetLevel) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      // If a previous iteration wishlisted ingredients it couldn't obtain, stop
      // so this job gets parked (onHold) until they're fulfilled — otherwise the
      // loop would spin without ever levelling up.
      if (await this.hasUnfulfilledRequests()) {
        return ObjectiveFailed;
      }

      // One snapshot for the whole scoring pass, which reads the bank once for
      // work that would otherwise re-read it per candidate ingredient.
      const bankSnapshot = await BankCache.create(this.character);
      if (bankSnapshot.stale) {
        logger.warn('Could not read the bank; deferring this crafting pass');
        return ObjectiveFailed;
      }

      logger.debug(
        `Finding craftable ${this.skill} items between ${Math.max(charLevel - this.levelRange, 0)} and ${charLevel}`,
      );

      const payload: GetAllItemsItemsGetParams = {
        craft_skill: this.skill,
        max_level: charLevel,
        min_level: Math.max(charLevel - this.levelRange, 0),
      };

      const craftableItemsListData = await getAllItemInformation(payload);
      if (craftableItemsListData instanceof ApiError) {
        await this.character.handleErrors(craftableItemsListData);
        return ObjectiveFailed;
      }

      const craftableItemsList = craftableItemsListData.data;
      if (craftableItemsList.length === 0) {
        logger.error(`No craftable items found. This shouldn't happen?`);
        return ObjectiveFailed;
      }

      if (!(await this.checkStatus())) return ObjectiveCancelled;

      // If there is each piece of equipment in the bank then we move on to finding the
      // most efficient item to craft to level up the skill
      const itemToCraft = await calculateBestCraftingItem(
        this.character,
        craftableItemsList,
        numToCraft,
        bankSnapshot,
      );

      logger.debug(
        `Found ${itemToCraft.code} item to craft with score ${itemToCraft.score}`,
      );

      if (
        await this.character.craftNow(
          numToCraft,
          itemToCraft.code,
          false,
          undefined,
          true,
        )
      ) {
        // Only deposit if the craft was successful
        await this.character.depositNow(numToCraft, itemToCraft.code);
      }

      // Recycle excess gear to get materials
      await this.character.tidyUpBank(this.character.role);

      charLevel = this.character.getCharacterLevel(
        this.character.data,
        this.skill,
      );
    }
    return ObjectiveCompleted;
  }
}

/**
 * Cost of an item we have no way to obtain: no dropper, no node, or a fight we
 * lose. Large enough to lose to any real recipe but still finite, so a recipe
 * with one unobtainable ingredient can still be compared against another.
 */
export const UNATTAINABLE = 1000000;

/** Rough cost of grinding a task to completion for one reward item. */
export const TASK_REWARD_ACTIONS = 150;

/**
 * Rough gold a single action earns, for pricing NPC offers sold for gold rather
 * than for a material. Roughly what selling a mob drop fetches, so a few hundred
 * gold of ingredients reads as the couple of actions it really costs.
 */
export const GOLD_PER_ACTION = 200;

/** The craft itself is one action on top of gathering the ingredients. */
const CRAFT_ACTION = 1;

/** The purchase itself is one action on top of earning the currency. */
const BUY_ACTION = 1;

/**
 * Per-pass memo of item code -> expected actions for one unit. Scoring a whole
 * candidate list revisits the same bars and ores repeatedly, and each mob drop
 * costs a fight simulation, so this is what keeps a pass affordable.
 */
export type CraftCostMemo = Map<string, number>;

/** Expected actions to obtain one unit, given a drop's rate and yield. */
function actionsPerUnit(drop: DropRateSchema): number {
  const averageYield = (drop.min_quantity + drop.max_quantity) / 2;
  return drop.rate / averageYield;
}

/**
 * Calculates the 'cheapest' item to craft, measured in expected game actions
 * (fights, gathers and crafts), counting what the bank already holds as free.
 * Lowest wins.
 *
 * @param numToCraft how many of the winner the caller will craft. Costing one
 * unit lets a bank holding enough for a single craft flatter a recipe whose
 * remaining units need an ingredient we have to grind for.
 * @todo Weight actions by cooldown so a 25s fight outranks a 5s gather
 */
export async function calculateBestCraftingItem(
  character: Character,
  craftableItemList: ItemSchema[],
  numToCraft: number,
  bankSnapshot: BankCache,
): Promise<{ code: string; score: number }> {
  let bestScore = Infinity;
  let bestItem = 'no_item';
  const memo: CraftCostMemo = new Map();

  logger.debug(
    `Example items in craftable list: ${craftableItemList[0].code}, ${craftableItemList.at(-1).code}`,
  );

  for (const item of craftableItemList) {
    logger.debug(`Calculating score of ${item.code}`);
    const currentScore = await calculateScore(
      item,
      bankSnapshot,
      character,
      numToCraft,
      memo,
    );

    if (currentScore < bestScore) {
      logger.debug(
        `${item.code} (${currentScore}) is better to craft than ${bestItem} (${bestScore})`,
      );
      bestScore = currentScore;
      bestItem = item.code;
    }
  }

  return { code: bestItem, score: bestScore };
}

/**
 * Quantities this candidate's costing has already claimed off the bank. Kept
 * separate from the snapshot so scoring never mutates the caller's copy, and so
 * one banked stack can't be counted against two parts of the same recipe.
 */
type Ledger = Map<string, number>;

type CostContext = {
  bank: BankCache;
  character: Character;
  memo: CraftCostMemo;
  ledger: Ledger;
  /** Recipes part-way through costing, so a cyclic recipe can't recurse forever. */
  inProgress: Set<string>;
};

/** Materials we obtain by fighting or questing rather than by crafting. */
function isFarmed(item: ItemSchema): boolean {
  return item.subtype === 'task' || item.subtype === 'mob';
}

function isCraftable(item: ItemSchema): boolean {
  return !isFarmed(item) && Boolean(item.craft?.items?.length);
}

/**
 * Expected actions to obtain `numCrafts` of this item, given what the bank holds.
 *
 * Every material in the game is `type: 'resource'`; the `subtype` is what says
 * whether it is fought for, gathered or handed out by a task, so dispatch is on
 * subtype. Ingredients are costed by this same walk at every depth, which is what
 * stops a rare drop hiding behind a bar from looking free.
 */
export async function calculateScore(
  craftableItem: ItemSchema,
  bankSnapshot: BankCache,
  character: Character,
  numCrafts: number,
  memo: CraftCostMemo = new Map(),
): Promise<number> {
  const context: CostContext = {
    bank: bankSnapshot,
    character,
    memo,
    // A fresh ledger per candidate. We only ever craft one of them, so each is
    // costed against the whole bank rather than an earlier candidate's leftovers.
    ledger: new Map(),
    inProgress: new Set(),
  };

  // Never discounted against itself — earning the XP is the point of the craft.
  return isCraftable(craftableItem)
    ? await costToCraft(craftableItem, numCrafts, context)
    : numCrafts * (await rawMaterialCost(craftableItem, context));
}

/** Actions to put `needed` of an item in hand, spending the bank before working. */
async function costToObtain(
  item: ItemSchema,
  needed: number,
  context: CostContext,
): Promise<number> {
  const banked = Math.max(
    0,
    context.bank.quantityOf(item.code) - (context.ledger.get(item.code) ?? 0),
  );
  const fromBank = Math.min(needed, banked);
  if (fromBank > 0) {
    context.ledger.set(
      item.code,
      (context.ledger.get(item.code) ?? 0) + fromBank,
    );
    logger.debug(
      `Bank covers ${fromBank} of the ${needed} ${item.code} needed`,
    );
  }

  const shortfall = needed - fromBank;
  if (shortfall <= 0) {
    return 0;
  }

  return isCraftable(item)
    ? await costToCraft(item, shortfall, context)
    : shortfall * (await rawMaterialCost(item, context));
}

async function costToCraft(
  item: ItemSchema,
  count: number,
  context: CostContext,
): Promise<number> {
  if (context.inProgress.has(item.code)) {
    logger.warn(
      `${item.code} is an ingredient of itself. Marking unattainable`,
    );
    return UNATTAINABLE;
  }
  context.inProgress.add(item.code);

  try {
    const crafts = count / (item.craft.quantity ?? 1);
    let total = crafts * CRAFT_ACTION;

    for (const ingredient of item.craft.items) {
      const ingredSchema = await getItemInformation(ingredient.code);
      if (ingredSchema instanceof ApiError) {
        logger.warn(
          `Failed to load ingredient ${ingredient.code}: ${ingredSchema.message}`,
        );
        return UNATTAINABLE;
      }
      total += await costToObtain(
        ingredSchema,
        crafts * ingredient.quantity,
        context,
      );
    }

    logger.debug(`${count} ${item.code} costs ${total} actions to craft`);
    return total;
  } finally {
    context.inProgress.delete(item.code);
  }
}

/**
 * Cost of one unit of something we can't craft. Independent of the bank and of
 * the recipe asking for it, so it is memoised for the whole pass — which also
 * means one fight simulation per monster rather than one per candidate.
 */
async function rawMaterialCost(
  item: ItemSchema,
  context: CostContext,
): Promise<number> {
  const memoised = context.memo.get(item.code);
  if (memoised !== undefined) {
    return memoised;
  }

  let cost: number;
  if (item.subtype === 'task') {
    logger.debug(
      `${item.code} is a task reward, costing ${TASK_REWARD_ACTIONS}`,
    );
    cost = TASK_REWARD_ACTIONS;
  } else if (item.subtype === 'mob') {
    cost = await mobDropCost(item, context.bank, context.character);
  } else if (item.subtype === 'npc') {
    cost = await npcPurchaseCost(item, context);
  } else {
    cost = await gatherCost(item);
  }

  context.memo.set(item.code, cost);
  return cost;
}

/**
 * Cost of fighting for a drop, taking the cheapest mob we can actually beat.
 * Bosses and event mobs are excluded outright — the fleet has no reliable way
 * to farm either.
 */
async function mobDropCost(
  item: ItemSchema,
  bankSnapshot: BankCache,
  character: Character,
): Promise<number> {
  const droppers: { mob: MonsterSchema; cost: number }[] = [];

  for (const mob of character.monsterData) {
    if (mob.type === 'boss' || (await isEventContent(mob.code))) {
      continue;
    }

    const drop = mob.drops.find((d) => d.code === item.code);
    if (drop) {
      droppers.push({ mob, cost: actionsPerUnit(drop) });
    }
  }

  droppers.sort((a, b) => a.cost - b.cost);

  if (droppers.length === 0) {
    logger.debug(`Nothing farmable drops ${item.code}. Marking unattainable`);
    return UNATTAINABLE;
  }

  for (const { mob, cost } of droppers) {
    const proposedLoadout = await character.proposeCombatLoadout(
      mob.code,
      bankSnapshot,
    );

    const canWin = await character.simulateFightNow(
      [proposedLoadout],
      mob.code,
      10, // Iterations
    );

    if (canWin) {
      logger.debug(
        `${mob.code} drops ${item.code} every ${cost} fights on average`,
      );
      return cost;
    }

    logger.debug(`${character.data.name} cannot kill ${mob.name}`);
  }

  return UNATTAINABLE;
}

/**
 * Cost of buying a material from a merchant, taking the cheapest offer.
 */
async function npcPurchaseCost(
  item: ItemSchema,
  context: CostContext,
): Promise<number> {
  // A merchant priced in a currency that is itself bought back with this item
  // would get stuck in a loop
  if (context.inProgress.has(item.code)) {
    logger.warn(`${item.code} is bought with itself. Marking unattainable`);
    return UNATTAINABLE;
  }
  context.inProgress.add(item.code);

  try {
    const offers = await getAllNpcItems({ code: item.code });
    if (offers instanceof ApiError) {
      logger.warn(
        `Failed to load NPC offers for ${item.code}: ${offers.message}`,
      );
      return UNATTAINABLE;
    }

    const forSale = offers.data.filter((offer) => offer.buy_price != null);
    if (forSale.length === 0) {
      logger.debug(`No NPC sells ${item.code}. Marking unattainable`);
      return UNATTAINABLE;
    }

    let cheapest = UNATTAINABLE;
    for (const offer of forSale) {
      cheapest = Math.min(cheapest, await offerCost(offer, context));
    }

    logger.debug(`${item.code} costs ${cheapest} actions to buy`);
    return cheapest;
  } finally {
    context.inProgress.delete(item.code);
  }
}

/**
 * Actions behind one merchant offer: the buy, plus earning what it asks for.
 * A currency that isn't gold is an item code, costed by the same walk so a mob
 * drop hiding behind a merchant doesn't look free.
 */
async function offerCost(
  offer: NPCItemSchema,
  context: CostContext,
): Promise<number> {
  const price = offer.buy_price;

  // ToDo: Should get the actual gold cost of the item instead of hardocding 200
  if (offer.currency === 'gold') {
    return BUY_ACTION + price / GOLD_PER_ACTION;
  }

  const currency = await getItemInformation(offer.currency);
  if (currency instanceof ApiError) {
    logger.warn(
      `Failed to load currency ${offer.currency}: ${currency.message}`,
    );
    return UNATTAINABLE;
  }

  const perUnit = isCraftable(currency)
    ? await costToCraft(currency, 1, context)
    : await rawMaterialCost(currency, context);

  return BUY_ACTION + price * perUnit;
}

/**
 * Cost of gathering a raw material from the most productive node dropping it.
 * Event nodes are skipped — they only exist while their event is running.
 */
async function gatherCost(item: ItemSchema): Promise<number> {
  const nodes = await getResourceNodesDropping(item.code);
  if (nodes instanceof ApiError) {
    logger.warn(`Failed to load nodes dropping ${item.code}: ${nodes.message}`);
    return UNATTAINABLE;
  }

  let cheapest = UNATTAINABLE;
  for (const node of nodes) {
    if (await isEventContent(node.code)) {
      continue;
    }

    for (const drop of node.drops) {
      if (drop.code === item.code) {
        cheapest = Math.min(cheapest, actionsPerUnit(drop));
      }
    }
  }

  logger.debug(`${item.code} takes ${cheapest} gathers per unit`);
  return cheapest;
}
