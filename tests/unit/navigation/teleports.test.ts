import {
  buildTeleportTable,
  chooseTeleportPotion,
  TeleportPotion,
} from '../../../src/core/navigation/teleports.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import {
  ItemSchema,
  MapSchema,
  MapLayer,
  MapAccessType,
} from '../../../src/types/types.js';

const potion = (
  code: string,
  level: number,
  effects: { code: string; value: number }[],
): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'consumable',
    subtype: 'potion',
    description: '',
    craft: null,
    tradeable: true,
    conditions: [],
    effects: effects.map((effect) => ({ ...effect, description: '' })),
  }) as ItemSchema;

describe('buildTeleportTable', () => {
  it('reads each potion destination out of its own teleport effect', () => {
    const table = buildTeleportTable([
      potion('enchanted_potion', 40, [{ code: 'teleport', value: 715 }]),
      potion('recall_potion', 5, [{ code: 'teleport', value: 271 }]),
    ]);

    expect(table).toEqual([
      { code: 'enchanted_potion', mapId: 715, level: 40 },
      { code: 'recall_potion', mapId: 271, level: 5 },
    ]);
  });

  it('leaves out consumables that do not teleport', () => {
    const table = buildTeleportTable([
      potion('cooked_gudgeon', 1, [{ code: 'heal', value: 30 }]),
      potion('recall_potion', 5, [{ code: 'teleport', value: 271 }]),
    ]);

    expect(table.map((entry) => entry.code)).toEqual(['recall_potion']);
  });

  it('tolerates an empty consumables list', () => {
    expect(buildTeleportTable([])).toEqual([]);
  });
});

function makeMap(
  map_id: number,
  x: number,
  y: number,
  transitionTo?: number,
): MapSchema {
  return {
    map_id,
    name: `Map_${map_id}`,
    skin: 'test_skin',
    x,
    y,
    layer: 'overworld' as MapLayer,
    access: { type: 'standard' as MapAccessType, conditions: [] },
    interactions: transitionTo
      ? {
          transition: {
            map_id: transitionTo,
            x: transitionTo * 10,
            y: 0,
            layer: 'overworld' as MapLayer,
            conditions: [],
          },
        }
      : {},
  };
}

// Four tiles far enough apart that each is its own zone, chained by transitions:
//   zone(1) -> zone(2) -> zone(3) -> zone(4)
// Map 5 sits alone with no transition in or out, so nothing walks there.
const maps = [
  makeMap(1, 0, 0, 2),
  makeMap(2, 10, 0, 3),
  makeMap(3, 20, 0, 4),
  makeMap(4, 30, 0),
  makeMap(5, 40, 0),
];
const graph = buildNavigationGraph(maps);
const [start, , , faraway, unreachable] = maps;

const potionTo = (code: string, mapId: number): TeleportPotion => ({
  code,
  mapId,
  level: 1,
});

describe('chooseTeleportPotion', () => {
  it('takes the potion that lands in the destination zone', () => {
    const chosen = chooseTeleportPotion(start.map_id, faraway, graph, [
      potionTo('enchanted_potion', 4),
    ]);

    expect(chosen?.code).toBe('enchanted_potion');
  });

  it('walks when no potion is held', () => {
    expect(
      chooseTeleportPotion(start.map_id, faraway, graph, []),
    ).toBeUndefined();
  });

  it('walks when the potion would not shorten the journey', () => {
    // Lands where the character already stands, so the walk is unchanged
    const chosen = chooseTeleportPotion(start.map_id, faraway, graph, [
      potionTo('recall_potion', 1),
    ]);

    expect(chosen).toBeUndefined();
  });

  it('ignores a potion whose landing zone cannot reach the destination', () => {
    const chosen = chooseTeleportPotion(start.map_id, faraway, graph, [
      potionTo('marooning_potion', 5),
    ]);

    expect(chosen).toBeUndefined();
  });

  it('drinks when walking has no route at all', () => {
    // The enchanted forest case: BFS finds nothing, but the potion lands there
    const chosen = chooseTeleportPotion(start.map_id, unreachable, graph, [
      potionTo('enchanted_potion', 5),
    ]);

    expect(chosen?.code).toBe('enchanted_potion');
  });

  it('stays put when already in the destination zone', () => {
    const chosen = chooseTeleportPotion(start.map_id, start, graph, [
      potionTo('enchanted_potion', 4),
    ]);

    expect(chosen).toBeUndefined();
  });

  it('does not drink a potion that strands the character behind the same gate', () => {
    // Excluding the last transition puts the destination out of reach from
    // everywhere, the potion's landing tile included. Judging the walk without
    // the exclusions would make the potion look like an improvement and waste it.
    const gated = new Set([maps[2].map_id]);

    const chosen = chooseTeleportPotion(
      start.map_id,
      faraway,
      graph,
      [potionTo('halfway_potion', 3)],
      gated,
    );

    expect(chosen).toBeUndefined();
  });

  it('prefers the potion that leaves the fewest hops', () => {
    const chosen = chooseTeleportPotion(start.map_id, faraway, graph, [
      potionTo('halfway_potion', 2),
      potionTo('doorstep_potion', 3),
    ]);

    expect(chosen?.code).toBe('doorstep_potion');
  });
});
