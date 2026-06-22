import { MapSchema } from '../../types/types.js';
import { buildZones, Zone, ZoneId } from './zones.js';

export interface TransitionEdge {
  fromZone: ZoneId;
  toZone: ZoneId;
  transitionPoint: MapSchema;
}

export interface NavigationGraph {
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
  /** Outgoing transition edges keyed by source zone. */
  edges: Map<ZoneId, TransitionEdge[]>;
}

export function buildNavigationGraph(allMaps: MapSchema[]): NavigationGraph {
  const { zoneOfMapId, zones } = buildZones(allMaps);
  const edges = new Map<ZoneId, TransitionEdge[]>();

  for (const map of allMaps) {
    const transition = map.interactions.transition;
    if (!transition) continue;

    const fromZone = zoneOfMapId.get(map.map_id);
    const toZone = zoneOfMapId.get(transition.map_id);
    // Skip transitions whose source or landing tile is not part of any zone
    // (e.g. it sits on a blocked/teleportation tile we do not model), or that
    // stay within the same zone.
    if (fromZone === undefined || toZone === undefined) continue;
    if (fromZone === toZone) continue;

    const list = edges.get(fromZone) ?? [];
    list.push({ fromZone, toZone, transitionPoint: map });
    edges.set(fromZone, list);
  }

  return { zoneOfMapId, zones, edges };
}

let cachedGraph: NavigationGraph | null = null;

/** Builds the navigation graph once and reuses it (identical for every character). */
export function getNavigationGraph(allMaps: MapSchema[]): NavigationGraph {
  if (!cachedGraph) cachedGraph = buildNavigationGraph(allMaps);
  return cachedGraph;
}

/** Test-only: clear the memoized graph between cases. */
export function resetNavigationGraphCache(): void {
  cachedGraph = null;
}
