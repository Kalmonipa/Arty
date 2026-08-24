import { ConditionOperator, ItemSchema, MapSchema } from '../../types/types.js';
import { effectValueOf } from '../../utils.js';
import { NavigationGraph } from './graph.js';
import { buildTransitionPath } from './pathfinding.js';
import {
  MoveSecondsPerTile,
  TeleportMinimumSavingSeconds,
  TransitionSeconds,
  UseItemSeconds,
} from '../../constants.js';

/** What a journey costs, in the two currencies a route can be paid in */
export type JourneyCost = {
  /** Cooldown seconds: five a tile walked, five a transition taken */
  seconds: number;
  /** Gold the transitions on the route charge to pass */
  gold: number;
};

/** A potion that drops the drinker onto a fixed map when used */
export type TeleportPotion = {
  code: string;
  /** The map the potion lands you on */
  mapId: number;
  /** Character level needed to use it */
  level: number;
};

/**
 * @description Every teleport potion the game knows about, with its destination.
 * The destination lives in the item's own effect, so a potion added to the game
 * needs no code change here.
 */
export function buildTeleportTable(
  consumables: ItemSchema[],
): TeleportPotion[] {
  return consumables
    .filter((item) =>
      item.effects?.some((effect) => effect.code === 'teleport'),
    )
    .map((item) => ({
      code: item.code,
      mapId: effectValueOf(item, 'teleport'),
      level: item.level,
    }));
}

/**
 * @description The held potion that gets the character to the destination most
 * cheaply, or undefined when walking is no worse. Routes are weighed on gold
 * first and time second: a potion that skips a paid gate is taken however little
 * time it saves, and otherwise the potion has to beat walking by a 60 second
 * buffer.
 *
 * `excludedTransitionIds` must be the same set move() gives the pathfinder —
 * gates the character cannot pass. Judging the walk without it could mean
 * the character tries routes it cannot actually take (an unaffordable gold cost for example)
 * and so talks itself out of the potion that was the only way through.
 */
export function chooseTeleportPotion(
  currentMapId: number,
  destination: MapSchema,
  graph: NavigationGraph,
  held: TeleportPotion[],
  excludedTransitionIds: Set<number> = new Set(),
): TeleportPotion | undefined {
  if (held.length === 0) return undefined;

  const costFrom = (mapId: number) =>
    journeyCost(mapId, destination, graph, excludedTransitionIds);

  const baseline = costFrom(currentMapId);
  if (baseline?.seconds === 0 && baseline.gold === 0) return undefined;

  let best: TeleportPotion | undefined;
  let bestCost: JourneyCost | null = null;

  for (const potion of held) {
    const remaining = costFrom(potion.mapId);
    if (remaining === null) continue;

    const total: JourneyCost = {
      seconds: UseItemSeconds + remaining.seconds,
      gold: remaining.gold,
    };
    if (bestCost === null || cheaper(total, bestCost)) {
      best = potion;
      bestCost = total;
    }
  }

  if (best === undefined || bestCost === null) return undefined;

  // Nowhere to walk to: any potion that reaches is worth it whatever it saves,
  // since the alternative is not getting there at all.
  if (baseline === null) return best;

  // If any transition costs gold then we'd prefer to use a potion
  if (bestCost.gold !== baseline.gold)
    return bestCost.gold < baseline.gold ? best : undefined;

  return baseline.seconds - bestCost.seconds > TeleportMinimumSavingSeconds
    ? best
    : undefined;
}

/** Cheaper on gold, and on time when the gold is the same */
const cheaper = (a: JourneyCost, b: JourneyCost): boolean =>
  a.gold !== b.gold ? a.gold < b.gold : a.seconds < b.seconds;

const tilesBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The gold a transition charges to pass, zero when it is free */
const goldToPass = (transitionPoint: MapSchema): number =>
  (transitionPoint.interactions.transition?.conditions ?? [])
    .filter(
      (condition) =>
        condition.code === 'gold' &&
        condition.operator === ConditionOperator.cost,
    )
    .reduce((total, condition) => total + condition.value, 0);

/**
 * @description What a journey costs: cooldown seconds (five per tile walked and
 * five per transition taken, per the game docs) and the gold its transitions
 * charge. Returns null when no route exists.
 */
export function journeyCost(
  fromMapId: number,
  destination: MapSchema,
  graph: NavigationGraph,
  excludedTransitionIds: Set<number> = new Set(),
): JourneyCost | null {
  const path = buildTransitionPath(
    fromMapId,
    destination,
    graph,
    excludedTransitionIds,
    { quiet: true },
  );
  if (path === null) return null;

  const start = graph.mapById.get(fromMapId);
  if (!start) return null;

  let seconds = 0;
  let gold = 0;
  let cursor: { x: number; y: number } = start;

  for (const transitionPoint of path) {
    seconds += tilesBetween(cursor, transitionPoint) * MoveSecondsPerTile;
    seconds += TransitionSeconds;
    gold += goldToPass(transitionPoint);
    // Each transition names the tile it drops you on; the next leg starts there
    cursor = transitionPoint.interactions.transition!;
  }

  return {
    seconds: seconds + tilesBetween(cursor, destination) * MoveSecondsPerTile,
    gold,
  };
}

/**
 * @description The time half of journeyCost, for callers weighing routes that
 * cost the same gold. Returns null when no route exists.
 */
export function journeySeconds(
  fromMapId: number,
  destination: MapSchema,
  graph: NavigationGraph,
  excludedTransitionIds: Set<number> = new Set(),
): number | null {
  return (
    journeyCost(fromMapId, destination, graph, excludedTransitionIds)
      ?.seconds ?? null
  );
}
