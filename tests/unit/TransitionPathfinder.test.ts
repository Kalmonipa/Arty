import { buildTransitionPath, SANDWHISPER_Y_BOUNDARY } from '../../src/core/TransitionPathfinder.js';
import { MapSchema } from '../../src/types/types.js';

// Helper to build minimal MapSchema objects for tests
function makeMap(
  map_id: number,
  x: number,
  y: number,
  layer: 'overworld' | 'underground' | 'interior',
  transitionDest?: { map_id: number; x: number; y: number; layer: 'overworld' | 'underground' | 'interior' },
): MapSchema {
  return {
    map_id,
    name: `Map_${map_id}`,
    skin: 'test_skin',
    x,
    y,
    layer,
    access: { type: 'standard', conditions: [] },
    interactions: transitionDest
      ? {
          transition: {
            map_id: transitionDest.map_id,
            x: transitionDest.x,
            y: transitionDest.y,
            layer: transitionDest.layer,
            conditions: [],
          },
        }
      : {},
  };
}

// Standard transition set used in most tests:
//   map 10: (-2, 6) overworld  -> (-2, 6) underground  [mainland mine entrance]
//   map 11: (-2, 6) underground -> (-2, 6) overworld   [mine exit]
//   map 20: (2, 16) overworld  -> (-2, 21) overworld   [mainland boat to island]
//   map 21: (-2, 21) overworld -> (2, 16) overworld    [island boat to mainland]
//   map 30: (3, 20) overworld  -> (1, 20) underground  [island mine entrance]
//   map 31: (1, 20) underground-> (3, 20) overworld    [island mine exit]
const standardTransitions: MapSchema[] = [
  makeMap(10, -2, 6, 'overworld', { map_id: 11, x: -2, y: 6, layer: 'underground' }),
  makeMap(11, -2, 6, 'underground', { map_id: 10, x: -2, y: 6, layer: 'overworld' }),
  makeMap(20, 2, 16, 'overworld', { map_id: 21, x: -2, y: 21, layer: 'overworld' }),
  makeMap(21, -2, 21, 'overworld', { map_id: 20, x: 2, y: 16, layer: 'overworld' }),
  makeMap(30, 3, 20, 'overworld', { map_id: 31, x: 1, y: 20, layer: 'underground' }),
  makeMap(31, 1, 20, 'underground', { map_id: 30, x: 3, y: 20, layer: 'overworld' }),
];

describe('buildTransitionPath', () => {
  describe('same region — no transitions needed', () => {
    it('returns empty array when character and target are both on mainland overworld', () => {
      const target = makeMap(99, 5, 5, 'overworld');
      const path = buildTransitionPath(0, 0, 'overworld', target, standardTransitions);
      expect(path).toEqual([]);
    });

    it('returns empty array when character and target are both on Sandwhisper Isle overworld', () => {
      const target = makeMap(99, -5, 22, 'overworld');
      const path = buildTransitionPath(0, SANDWHISPER_Y_BOUNDARY, 'overworld', target, standardTransitions);
      expect(path).toEqual([]);
    });

    it('returns empty array when character and target are both underground (regular mine tile)', () => {
      // Regular underground tile — not the destination of any transition
      const target = makeMap(99, 0, 0, 'underground');
      const path = buildTransitionPath(-2, 6, 'underground', target, standardTransitions);
      expect(path).toEqual([]);
    });
  });

  describe('single transition required', () => {
    it('mainland overworld -> underground: inserts mine entrance transition point', () => {
      const target = makeMap(99, 0, 0, 'underground');
      const path = buildTransitionPath(0, 0, 'overworld', target, standardTransitions);

      expect(path).toHaveLength(1);
      // The transition point must be the mainland mine entrance (map 10)
      expect(path[0].map_id).toBe(10);
    });

    it('picks the mine entrance closest to the target when multiple exist', () => {
      // Two mainland mine entrances: one close to target, one far away
      const closeEntrance = makeMap(50, 3, -3, 'overworld', { map_id: 51, x: 3, y: -3, layer: 'underground' });
      const farEntrance   = makeMap(52, 20, 20, 'overworld', { map_id: 53, x: 20, y: 20, layer: 'underground' });
      const transitions = [...standardTransitions, closeEntrance, farEntrance];

      const target = makeMap(99, 4, -4, 'underground');
      const path = buildTransitionPath(0, 0, 'overworld', target, transitions);

      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(50); // closest destination to (4,-4)
    });

    it('underground -> mainland overworld: inserts mine exit transition point', () => {
      const target = makeMap(99, 5, 5, 'overworld');
      const path = buildTransitionPath(-2, 6, 'underground', target, standardTransitions);

      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(11); // underground -> overworld exit
    });

    it('mainland overworld -> Sandwhisper Isle overworld: inserts boat transition point', () => {
      const target = makeMap(99, -3, 22, 'overworld');
      const path = buildTransitionPath(0, 0, 'overworld', target, standardTransitions);

      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(20); // mainland boat
    });

    it('Sandwhisper Isle overworld -> mainland overworld: inserts island boat transition point', () => {
      const target = makeMap(99, 5, 5, 'overworld');
      const path = buildTransitionPath(0, SANDWHISPER_Y_BOUNDARY, 'overworld', target, standardTransitions);

      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(21); // island boat
    });

    it('targets a map that is the direct destination of a transition (exact match)', () => {
      // Map 77 is a dungeon entrance in the underground, reachable via transition from map 10
      const dungeonEntrance = makeMap(77, 3, -4, 'underground', { map_id: 71, x: 1, y: -4, layer: 'underground' });
      // Add a transition that leads directly to map 77 from the overworld
      const overworldEntry = makeMap(60, 5, -3, 'overworld', { map_id: 77, x: 3, y: -4, layer: 'underground' });
      const transitions = [...standardTransitions, dungeonEntrance, overworldEntry];

      const target = makeMap(77, 3, -4, 'underground');
      const path = buildTransitionPath(0, 0, 'overworld', target, transitions);

      // Should find map 60 (the overworld entry that leads directly to map 77)
      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(60);
    });
  });

  describe('two transitions required', () => {
    it('mainland overworld -> underground dungeon (requires overworld->underground then underground->dungeon)', () => {
      // Dungeon at (1,-4) underground, accessible only from (3,-4) underground
      const dungeon = makeMap(71, 1, -4, 'underground');
      const dungeonEntrance = makeMap(77, 3, -4, 'underground', { map_id: 71, x: 1, y: -4, layer: 'underground' });
      const transitions = [...standardTransitions, dungeonEntrance];

      const path = buildTransitionPath(0, 0, 'overworld', dungeon, transitions);

      expect(path).toHaveLength(2);
      // First step: overworld mine entrance (leads underground, closest to (3,-4))
      expect(path[0].layer).toBe('overworld');
      expect(path[0].interactions.transition.layer).toBe('underground');
      // Second step: underground dungeon entrance at (3,-4)
      expect(path[1].map_id).toBe(77);
    });

    it('mainland overworld -> Sandwhisper Mine (two overworld->overworld then overworld->underground)', () => {
      const target = makeMap(99, 2, 22, 'underground');
      const path = buildTransitionPath(0, 0, 'overworld', target, standardTransitions);

      expect(path).toHaveLength(2);
      // First hop: mainland boat to island (overworld -> overworld)
      expect(path[0].map_id).toBe(20);
      // Second hop: island mine entrance (overworld -> underground)
      expect(path[1].map_id).toBe(30);
    });
  });

  describe('interior layer — character already standing on exit transition', () => {
    it('returns the exit at the current position even when another interior exit has a closer destination', () => {
      //   map 40: (-3, 12) interior -> (-3, 12) overworld  [current interior exit]
      //   map 42: ( 0, 13) interior -> ( 0, 13) overworld  [different interior, closer to bank]
      const currentExit = makeMap(40, -3, 12, 'interior', { map_id: 41, x: -3, y: 12, layer: 'overworld' });
      const otherExit   = makeMap(42,  0, 13, 'interior', { map_id: 43, x:  0, y: 13, layer: 'overworld' });
      const transitions = [...standardTransitions, currentExit, otherExit];

      // Bank at (7, 13) overworld — (0, 13) destination would be closer, but it is on a different
      // interior map that the character cannot walk to.
      const target = makeMap(99, 7, 13, 'overworld');
      const path = buildTransitionPath(-3, 12, 'interior', target, transitions);

      expect(path).toHaveLength(1);
      expect(path[0].map_id).toBe(40);
    });
  });

  describe('error cases', () => {
    it('returns null when no transition exists for the target layer', () => {
      const target = makeMap(99, 5, 5, 'interior'); // no interior transitions defined
      const path = buildTransitionPath(0, 0, 'overworld', target, standardTransitions);
      expect(path).toBeNull();
    });

    it('returns null when transition graph has no path (empty transitions)', () => {
      const target = makeMap(99, 5, 5, 'underground');
      const path = buildTransitionPath(0, 0, 'overworld', target, []);
      expect(path).toBeNull();
    });
  });
});
