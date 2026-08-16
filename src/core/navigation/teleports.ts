import { ItemSchema, MapSchema } from '../../types/types.js';
import { effectValueOf } from '../../utils.js';
import { NavigationGraph } from './graph.js';
import { buildTransitionPath } from './pathfinding.js';

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
 * @description The held potion that gets the character closest to the
 * destination, or undefined when walking is no worse.
 *
 * A potion counts as free rather than as a hop: unlike a boat it costs no gold
 * and no walk to a transition tile, so landing two zones out still beats a
 * three-transition trek. When walking has no route at all, any potion that can
 * reach the destination wins outright.
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

  const hopsFrom = (mapId: number): number | null =>
    buildTransitionPath(mapId, destination, graph, excludedTransitionIds, {
      quiet: true,
    })?.length ?? null;

  const baseline = hopsFrom(currentMapId);
  if (baseline === 0) return undefined;

  let best: TeleportPotion | undefined;
  let bestHops = baseline;

  for (const potion of held) {
    const hops = hopsFrom(potion.mapId);
    if (hops === null) continue;
    if (bestHops === null || hops < bestHops) {
      best = potion;
      bestHops = hops;
    }
  }

  return best;
}
