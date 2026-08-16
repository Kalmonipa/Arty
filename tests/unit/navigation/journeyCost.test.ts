import * as fs from 'fs';
import { journeySeconds } from '../../../src/core/navigation/teleports.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import { MapSchema } from '../../../src/types/types.js';

const maps: MapSchema[] = JSON.parse(
  fs.readFileSync('data/maps-data.json', 'utf-8'),
);
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
