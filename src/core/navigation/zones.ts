import { MapSchema, MapLayer } from '../../types/types.js';

export type ZoneId = number;

export interface Zone {
  id: ZoneId;
  layer: MapLayer;
  mapIds: Set<number>;
}

export interface ZoneIndex {
  /** Maps every walkable/restricted map_id to the zone it belongs to. */
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
}

// Tiles you can stand on and freely walk between. 'blocked' and 'teleportation'
// are boundaries; 'restricted' forms its own isolated zones (handled in a
// separate pass). Compared as strings so 'restricted' works even though the
// generated MapAccessType enum does not include it yet.
const WALKABLE_TYPES = new Set<string>(['standard', 'conditional']);

const coordKey = (x: number, y: number): string => `${x},${y}`;
const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function buildZones(allMaps: MapSchema[]): ZoneIndex {
  const zoneOfMapId = new Map<number, ZoneId>();
  const zones = new Map<ZoneId, Zone>();
  let nextZoneId = 0;

  const mapsByLayer = new Map<MapLayer, MapSchema[]>();
  for (const map of allMaps) {
    const list = mapsByLayer.get(map.layer) ?? [];
    list.push(map);
    mapsByLayer.set(map.layer, list);
  }

  for (const [layer, maps] of mapsByLayer) {
    const coordToMap = new Map<string, MapSchema>();
    for (const map of maps) coordToMap.set(coordKey(map.x, map.y), map);

    const isWalkable = (m: MapSchema) => WALKABLE_TYPES.has(m.access.type);
    // Cast to string: 'restricted' is beta-only and absent from the MapAccessType
    // enum, so a direct === comparison would not type-check.
    const isRestricted = (m: MapSchema) =>
      (m.access.type as string) === 'restricted';

    // Two independent flood-fill passes: normal walkable tiles first, then
    // restricted tiles (which connect only to each other).
    for (const matches of [isWalkable, isRestricted]) {
      for (const start of maps) {
        if (zoneOfMapId.has(start.map_id) || !matches(start)) continue;

        const id = nextZoneId++;
        const zone: Zone = { id, layer, mapIds: new Set<number>() };
        const stack: MapSchema[] = [start];

        while (stack.length > 0) {
          const current = stack.pop();
          if (!current || zoneOfMapId.has(current.map_id)) continue;
          zoneOfMapId.set(current.map_id, id);
          zone.mapIds.add(current.map_id);

          for (const [dx, dy] of NEIGHBOURS) {
            const neighbour = coordToMap.get(
              coordKey(current.x + dx, current.y + dy),
            );
            if (
              neighbour &&
              !zoneOfMapId.has(neighbour.map_id) &&
              matches(neighbour)
            ) {
              stack.push(neighbour);
            }
          }
        }

        zones.set(id, zone);
      }
    }
  }

  return { zoneOfMapId, zones };
}
