import { ItemSchema, MapSchema } from '../../types/types.js';
import { effectValueOf } from '../../utils.js';
import { NavigationGraph } from './graph.js';
import { buildTransitionPath } from './pathfinding.js';
import {
  MoveSecondsPerTile,
  TransitionSeconds,
  UseItemSeconds,
} from '../../constants.js';

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
 * @description The held potion that gets the character to the destination
 * soonest, or undefined when walking there is no slower.
 *
 * Everything is costed in cooldown seconds, because that is what the character
 * actually spends. Counting zone transitions instead cannot separate two
 * potions that land in the same zone, which is the common case — a character
 * mining gold underground and heading for the task master would take a recall
 * potion and then walk seventeen tiles, when a forest bank potion lands three
 * tiles away.
 *
 * `excludedTransitionIds` must be the same set move() gives the pathfinder —
 * gates the character cannot pass. Judging the walk without it flatters routes
 * the character cannot actually take (an unaffordable gold cost, say) and so
 * talks itself out of the potion that was the only way through.
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
    journeySeconds(mapId, destination, graph, excludedTransitionIds);

  const baseline = costFrom(currentMapId);
  if (baseline === 0) return undefined;

  let best: TeleportPotion | undefined;
  let bestSeconds = baseline;

  for (const potion of held) {
    const remaining = costFrom(potion.mapId);
    if (remaining === null) continue;

    const total = UseItemSeconds + remaining;
    if (bestSeconds === null || total < bestSeconds) {
      best = potion;
      bestSeconds = total;
    }
  }

  return best;
}

const tilesBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * @description What a journey costs in cooldown seconds: five per tile walked
 * and five per transition taken, per the game docs. Returns null when no route
 * exists.
 *
 * Distance is Manhattan rather than the game's A* path length. Across the real
 * map those agree everywhere except 22 of the mainland's 343 tiles, where this
 * understates the walk by at most four tiles — close enough to rank routes,
 * which is all this is for.
 */
export function journeySeconds(
  fromMapId: number,
  destination: MapSchema,
  graph: NavigationGraph,
  excludedTransitionIds: Set<number> = new Set(),
): number | null {
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
  let cursor: { x: number; y: number } = start;

  for (const transitionPoint of path) {
    seconds += tilesBetween(cursor, transitionPoint) * MoveSecondsPerTile;
    seconds += TransitionSeconds;
    // Each transition names the tile it drops you on; the next leg starts there
    cursor = transitionPoint.interactions.transition!;
  }

  return seconds + tilesBetween(cursor, destination) * MoveSecondsPerTile;
}
