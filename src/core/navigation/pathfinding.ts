import { MapSchema } from '../../types/types.js';
import { logger } from '../../utils.js';
import { NavigationGraph } from './graph.js';
import { ZoneId } from './zones.js';

const manhattan = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Ordered list of transition points to visit to get from the character's
 * current map to the target. For each returned map: walk to its (x, y), then
 * call /transition. After the last one, move directly to the target.
 *
 * Returns [] when already in the target's zone, or null when no route exists.
 * Minimises the number of transitions (BFS); ties are broken toward the
 * transition whose landing tile is closest to the target.
 *
 * Pass `quiet` when asking speculatively (e.g. "what would the route be if I
 * teleported first?") — a missing route is an answer there, not a fault.
 */
export function buildTransitionPath(
  currentMapId: number,
  target: MapSchema,
  graph: NavigationGraph,
  excludedTransitionIds: Set<number> = new Set(),
  options: { quiet?: boolean } = {},
): MapSchema[] | null {
  const reportFailure = (message: string) => {
    if (!options.quiet) logger.error(message);
    return null;
  };

  const startZone = graph.zoneOfMapId.get(currentMapId);
  const targetZone = graph.zoneOfMapId.get(target.map_id);

  if (startZone === undefined) {
    return reportFailure(
      `buildTransitionPath: no zone for current map ${currentMapId}`,
    );
  }
  if (targetZone === undefined) {
    return reportFailure(
      `buildTransitionPath: no zone for target ${target.name} (${target.map_id})`,
    );
  }
  if (startZone === targetZone) return [];

  interface BFSNode {
    zone: ZoneId;
    path: MapSchema[];
  }
  const queue: BFSNode[] = [{ zone: startZone, path: [] }];
  const visited = new Set<ZoneId>([startZone]);

  while (queue.length > 0) {
    const { zone, path } = queue.shift()!;

    const outgoing = (graph.edges.get(zone) ?? [])
      .filter((e) => !excludedTransitionIds.has(e.transitionPoint.map_id))
      .sort(
        (a, b) =>
          manhattan(a.transitionPoint.interactions.transition!, target) -
          manhattan(b.transitionPoint.interactions.transition!, target),
      );

    for (const edge of outgoing) {
      if (visited.has(edge.toZone)) continue;
      const newPath = [...path, edge.transitionPoint];
      if (edge.toZone === targetZone) return newPath;
      visited.add(edge.toZone);
      queue.push({ zone: edge.toZone, path: newPath });
    }
  }

  return reportFailure(
    `buildTransitionPath: no path to ${target.name} (${target.x}, ${target.y}, ${target.layer})`,
  );
}
