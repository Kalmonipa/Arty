import { buildTransitionPath } from '../../../src/core/navigation/pathfinding.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import {
  MapSchema,
  MapLayer,
  MapAccessType,
} from '../../../src/types/types.js';

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

// Overworld zone {1,2} (adjacent) and one underground zone {3,4} (adjacent).
// Two overworld->underground transitions both reach the underground zone:
//   map 1 (0,0) -> map 3 (0,0) underground   [landing far from target (1,5)]
//   map 2 (1,0) -> map 4 (1,0) underground   [landing near target (1,5)]
const maps = [
  makeMap(1, 0, 0, 'overworld', {
    map_id: 3,
    x: 0,
    y: 0,
    layer: 'underground',
  }),
  makeMap(2, 1, 0, 'overworld', {
    map_id: 4,
    x: 1,
    y: 0,
    layer: 'underground',
  }),
  makeMap(3, 0, 0, 'underground'),
  makeMap(4, 1, 0, 'underground'),
];

describe('buildTransitionPath', () => {
  it('returns an empty array when current and target share a zone', () => {
    const graph = buildNavigationGraph(maps);
    const target = makeMap(2, 1, 0, 'overworld');
    expect(buildTransitionPath(1, target, graph)).toEqual([]);
  });

  it('returns the single transition needed to cross zones', () => {
    const graph = buildNavigationGraph(maps);
    const target = makeMap(3, 0, 0, 'underground');
    const path = buildTransitionPath(1, target, graph);
    expect(path).not.toBeNull();
    expect(path!.map((m) => m.map_id)).toEqual([1]);
  });

  it('tie-breaks toward the transition whose landing is closest to the target', () => {
    const graph = buildNavigationGraph(maps);
    // Target (1,5) underground is closest to map 2's landing (1,0).
    const target = makeMap(4, 1, 5, 'underground');
    const path = buildTransitionPath(1, target, graph);
    expect(path!.map((m) => m.map_id)).toEqual([2]);
  });

  it('skips an excluded transition and routes through the alternative', () => {
    const graph = buildNavigationGraph(maps);
    const target = makeMap(4, 1, 5, 'underground');
    const path = buildTransitionPath(1, target, graph, new Set([2]));
    expect(path!.map((m) => m.map_id)).toEqual([1]);
  });

  it('returns null when the target is in an unreachable zone', () => {
    // Island zone {5} with no transition into it.
    const isolated = [...maps, makeMap(5, 50, 50, 'overworld')];
    const graph = buildNavigationGraph(isolated);
    const target = makeMap(5, 50, 50, 'overworld');
    expect(buildTransitionPath(1, target, graph)).toBeNull();
  });

  it('returns null when the current map is not in any zone', () => {
    const graph = buildNavigationGraph(maps);
    const target = makeMap(3, 0, 0, 'underground');
    expect(buildTransitionPath(999, target, graph)).toBeNull();
  });
});
