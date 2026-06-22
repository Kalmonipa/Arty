import {
  buildNavigationGraph,
  getNavigationGraph,
  resetNavigationGraphCache,
} from '../../../src/core/navigation/graph.js';
import { MapSchema, MapLayer, MapAccessType } from '../../../src/types/types.js';

function makeMap(
  map_id: number,
  x: number,
  y: number,
  layer: MapLayer = 'overworld',
  transitionDest?: { map_id: number; x: number; y: number; layer: MapLayer },
): MapSchema {
  return {
    map_id,
    name: `Map_${map_id}`,
    skin: 'test_skin',
    x,
    y,
    layer,
    access: { type: 'standard' as MapAccessType, conditions: [] },
    interactions: transitionDest
      ? { transition: { ...transitionDest, conditions: [] } }
      : {},
  };
}

describe('buildNavigationGraph', () => {
  beforeEach(() => resetNavigationGraphCache());

  it('adds an edge between the source and destination zones of a transition', () => {
    // Two overworld tiles form zone A; one underground tile forms zone B.
    // Map 1 has a transition into the underground tile (map 3).
    const maps = [
      makeMap(1, 0, 0, 'overworld', {
        map_id: 3,
        x: 0,
        y: 0,
        layer: 'underground',
      }),
      makeMap(2, 1, 0, 'overworld'),
      makeMap(3, 0, 0, 'underground'),
    ];
    const graph = buildNavigationGraph(maps);

    const fromZone = graph.zoneOfMapId.get(1)!;
    const toZone = graph.zoneOfMapId.get(3)!;
    const edges = graph.edges.get(fromZone) ?? [];

    expect(edges).toHaveLength(1);
    expect(edges[0].toZone).toBe(toZone);
    expect(edges[0].transitionPoint.map_id).toBe(1);
  });

  it('skips transitions whose source or destination is not in any zone', () => {
    // The transition source is a blocked tile (not in any zone).
    const maps: MapSchema[] = [
      {
        ...makeMap(1, 0, 0, 'overworld', {
          map_id: 2,
          x: 0,
          y: 0,
          layer: 'underground',
        }),
        access: { type: 'blocked' as MapAccessType, conditions: [] },
      },
      makeMap(2, 0, 0, 'underground'),
    ];
    const graph = buildNavigationGraph(maps);
    expect([...graph.edges.values()].flat()).toHaveLength(0);
  });

  it('getNavigationGraph returns the same cached instance on repeated calls', () => {
    const maps = [makeMap(1, 0, 0)];
    const first = getNavigationGraph(maps);
    const second = getNavigationGraph([makeMap(9, 9, 9)]);
    expect(second).toBe(first); // cached; second argument ignored
  });
});
