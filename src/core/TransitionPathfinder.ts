import { MapLayer, MapSchema } from '../types/types.js';
import { logger } from '../utils.js';

export const SANDWHISPER_Y_BOUNDARY = 17;
const MAX_PATH_DEPTH = 10;

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Returns a string key representing the navigable region for a given position.
 * Used by the BFS to avoid revisiting the same region.
 */
function getRegionKey(x: number, y: number, layer: MapLayer): string {
  if (layer === MapLayer.overworld || layer === MapLayer.underground) {
    // Both layers are divided at the y-boundary: mainland (y < 17) vs Sandwhisper Isle (y >= 17)
    return `${layer}:${y >= SANDWHISPER_Y_BOUNDARY ? 'island' : 'mainland'}`;
  }
  // Interior/sub-areas: use exact coordinates since they are isolated spaces
  return `${layer}:${x},${y}`;
}

/**
 * Returns true if the target is directly walk-able from the character's current position,
 * with no transitions required.
 *
 * A target is NOT directly reachable when:
 * - It is on a different layer, OR
 * - It is on a different overworld/underground region (mainland vs Sandwhisper Isle, y >= SANDWHISPER_Y_BOUNDARY), OR
 * - It is the destination of a same-layer transition (i.e. a dungeon/sub-area accessed from within
 *   the same layer, e.g. a dungeon entrance in the underground)
 */
function isDirectlyReachable(
  charX: number,
  charY: number,
  charLayer: MapLayer,
  target: MapSchema,
  allTransitions: MapSchema[],
): boolean {
  if (charLayer !== target.layer) return false;

  // For overworld and underground, Sandwhisper Isle (y >= boundary) and the mainland (y < boundary)
  // are separate navigable regions — the same y-coordinate boundary applies to both layers.
  if (charLayer === MapLayer.overworld || charLayer === MapLayer.underground) {
    if ((charY >= SANDWHISPER_Y_BOUNDARY) !== (target.y >= SANDWHISPER_Y_BOUNDARY)) {
      return false;
    }
  }

  // For non-overworld layers: a target that is only accessible via a same-layer transition
  // (e.g. a dungeon inside the underground mine) is not directly walk-able.
  if (charLayer !== MapLayer.overworld) {
    const targetIsSubArea = allTransitions.some(
      (t) =>
        t.interactions.transition?.map_id === target.map_id && t.layer === target.layer,
    );
    if (targetIsSubArea) return false;
  }

  return true;
}

/**
 * Builds an ordered list of transition points the character must visit to reach the target.
 *
 * Uses a BFS from the character's current position, exploring reachable transitions in order
 * of their destination's proximity to the final target (greedy tie-breaking within the same
 * BFS depth level).
 *
 * For each MapSchema in the returned array the character should:
 *   1. Move to that map's (x, y) coordinates
 *   2. Call the /transition endpoint
 *
 * After all transitions the character can move directly to the final target.
 *
 * Returns null if no valid path exists.
 *
 * Example — character at (0,0) overworld (mainland), target at (1,-4) underground (dungeon):
 *   [ map at (-2,6) overworld,  map at (3,-4) underground ]
 *   → move to (-2,6) → transition → underground
 *   → move to (3,-4) → transition → (1,-4) underground (target)
 */
export function buildTransitionPath(
  charX: number,
  charY: number,
  charLayer: MapLayer,
  target: MapSchema,
  allTransitions: MapSchema[],
  excludedTransitionIds: Set<number> = new Set(),
): MapSchema[] | null {
  if (isDirectlyReachable(charX, charY, charLayer, target, allTransitions)) {
    return [];
  }

  // Transitions the caller has marked as unusable (e.g. a route the game rejected with a
  // "no path" 595 on a previous attempt). They are skipped so an alternative route is found.
  const usableTransitions = allTransitions.filter(
    (t) => !excludedTransitionIds.has(t.map_id),
  );

  // If the character is already standing on a transition point whose destination makes the
  // target reachable, use it immediately. This prevents the BFS from preferring a transition
  // on a different map (e.g. a closer interior exit that is physically unreachable).
  const standingOnTransition = usableTransitions.find(
    (t) => t.x === charX && t.y === charY && t.layer === charLayer,
  );
  if (standingOnTransition?.interactions.transition) {
    const dest = standingOnTransition.interactions.transition;
    if (
      dest.map_id === target.map_id ||
      isDirectlyReachable(dest.x, dest.y, dest.layer, target, allTransitions)
    ) {
      return [standingOnTransition];
    }
  }

  interface BFSNode {
    x: number;
    y: number;
    layer: MapLayer;
    path: MapSchema[];
  }

  const queue: BFSNode[] = [{ x: charX, y: charY, layer: charLayer, path: [] }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { x, y, layer, path } = queue.shift();

    if (path.length >= MAX_PATH_DEPTH) continue;

    const regionKey = getRegionKey(x, y, layer);
    if (visited.has(regionKey)) continue;
    visited.add(regionKey);

    // Find all transition points directly walk-able from the current position, sorted by
    // how close their destination is to the final target (to prefer shorter final walks).
    const reachableTransitions = usableTransitions
      .filter((t) => isDirectlyReachable(x, y, layer, t, allTransitions))
      .sort(
        (a, b) =>
          manhattan(a.interactions.transition, target) -
          manhattan(b.interactions.transition, target),
      );

    for (const transitionPoint of reachableTransitions) {
      const dest = transitionPoint.interactions.transition;
      if (!dest) continue;

      const newPath = [...path, transitionPoint];

      // Check whether we can reach the target from the transition's landing spot
      const landedAtTarget = dest.map_id === target.map_id;
      const targetWalkableFromDest = isDirectlyReachable(
        dest.x,
        dest.y,
        dest.layer,
        target,
        allTransitions,
      );

      if (landedAtTarget || targetWalkableFromDest) {
        return newPath;
      }

      queue.push({ x: dest.x, y: dest.y, layer: dest.layer, path: newPath });
    }
  }

  logger.error(
    `buildTransitionPath: no path found to reach ${target.name} at (${target.x}, ${target.y}) on ${target.layer}`,
  );
  return null;
}
