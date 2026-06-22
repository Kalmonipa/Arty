import { buildZones } from '../../../src/core/navigation/zones.js';
import { MapSchema, MapLayer, MapAccessType } from '../../../src/types/types.js';

function makeMap(
  map_id: number,
  x: number,
  y: number,
  layer: MapLayer = 'overworld',
  type: string = 'standard',
): MapSchema {
  return {
    map_id,
    name: `Map_${map_id}`,
    skin: 'test_skin',
    x,
    y,
    layer,
    access: { type: type as MapAccessType, conditions: [] },
    interactions: {},
  };
}

describe('buildZones', () => {
  it('groups two adjacent walkable tiles into one zone', () => {
    const { zoneOfMapId } = buildZones([makeMap(1, 0, 0), makeMap(2, 1, 0)]);
    expect(zoneOfMapId.get(1)).toBe(zoneOfMapId.get(2));
  });

  it('splits non-adjacent walkable tiles into separate zones', () => {
    const { zoneOfMapId } = buildZones([makeMap(1, 0, 0), makeMap(2, 5, 0)]);
    expect(zoneOfMapId.get(1)).not.toBe(zoneOfMapId.get(2));
  });

  it('does not bridge two tiles through a blocked tile between them', () => {
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0),
      makeMap(2, 1, 0, 'overworld', 'blocked'),
      makeMap(3, 2, 0),
    ]);
    expect(zoneOfMapId.has(2)).toBe(false); // blocked tile is not in any zone
    expect(zoneOfMapId.get(1)).not.toBe(zoneOfMapId.get(3));
  });

  it('excludes teleportation tiles from all zones', () => {
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0, 'overworld', 'teleportation'),
    ]);
    expect(zoneOfMapId.has(1)).toBe(false);
  });

  it('never merges tiles on different layers even at the same coordinates', () => {
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0, 'overworld'),
      makeMap(2, 0, 0, 'underground'),
    ]);
    expect(zoneOfMapId.get(1)).not.toBe(zoneOfMapId.get(2));
  });

  it('puts restricted tiles in their own zone, separate from adjacent walkable tiles', () => {
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0, 'overworld', 'standard'),
      makeMap(2, 1, 0, 'overworld', 'restricted'),
      makeMap(3, 2, 0, 'overworld', 'restricted'),
    ]);
    expect(zoneOfMapId.get(1)).not.toBe(zoneOfMapId.get(2));
    expect(zoneOfMapId.get(2)).toBe(zoneOfMapId.get(3)); // restricted tiles connect to each other
  });
});
