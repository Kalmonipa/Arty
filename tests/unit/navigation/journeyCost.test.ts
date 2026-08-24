import {
  journeyCost,
  journeySeconds,
} from '../../../src/core/navigation/teleports.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import { MapSchema } from '../../../src/types/types.js';
import { loadMaps } from '../../fixtures/gameData.js';

const maps = loadMaps();
const graph = buildNavigationGraph(maps);
const byId = (id: number) => maps.find((m) => m.map_id === id)!;

/**
 * https://docs.artifactsmmo.com/concepts/maps_and_movement/#move
 * "The cooldown is 5 seconds per map", and a transition costs 5 seconds.
 */
describe('journeySeconds', () => {
  it('charges five seconds a tile for a walk inside one zone', () => {
    // Forest bank (7,13) to the item task master (4,13): three tiles
    expect(journeySeconds(955, byId(946), graph)).toBe(15);
  });

  it('costs nothing when already standing on the destination', () => {
    expect(journeySeconds(946, byId(946), graph)).toBe(0);
  });

  it('charges the transition as well as the walking either side of it', () => {
    // Gold rocks (5,-4) underground: one tile to the transition at (5,-3),
    // five for the transition, then seventeen tiles from (5,-3) overworld
    expect(journeySeconds(83, byId(946), graph)).toBe(5 + 5 + 17 * 5);
  });

  it('reports no route when every way through is excluded', () => {
    const gated = new Set(
      maps
        .filter((map) => map.interactions.transition)
        .map((map) => map.map_id),
    );

    expect(journeySeconds(83, byId(946), graph, gated)).toBeNull();
  });
});

/**
 * Three transitions in the whole game charge gold: 718 into the Enchanted
 * Forest (5000), and 1093/1336 either way across to Sandwhisper Isle (1000).
 * journeySeconds cannot see them, which is why a character walks through a
 * 5000 gold gate holding the potion that skips it.
 */
describe('journeyCost', () => {
  it('charges the gold a gated transition costs', () => {
    // Spawn to the Enchanted Forest routes through the 5000 gold gate at 718
    expect(journeyCost(271, byId(715), graph)).toEqual({
      seconds: 80,
      gold: 5000,
    });
  });

  it.each([
    ['onto Sandwhisper Isle', 271, 1234],
    ['back off Sandwhisper Isle', 1234, 271],
  ])('charges the 1000 gold crossing %s', (_name, from, to) => {
    expect(journeyCost(from, byId(to), graph)?.gold).toBe(1000);
  });

  it('charges no gold on a route through no gate', () => {
    // Leaving the Enchanted Forest is free; only coming in is paid for
    expect(journeyCost(715, byId(271), graph)).toEqual({
      seconds: 80,
      gold: 0,
    });
  });

  it('reports no route when every way through is excluded', () => {
    const gated = new Set(
      maps
        .filter((map) => map.interactions.transition)
        .map((map) => map.map_id),
    );

    expect(journeyCost(83, byId(946), graph, gated)).toBeNull();
  });

  it('agrees with journeySeconds on the time half', () => {
    expect(journeyCost(83, byId(946), graph)?.seconds).toBe(
      journeySeconds(83, byId(946), graph),
    );
  });
});
