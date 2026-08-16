import * as fs from 'fs';
import {
  buildTeleportTable,
  chooseTeleportPotion,
  TeleportPotion,
} from '../../../src/core/navigation/teleports.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import { buildTransitionPath } from '../../../src/core/navigation/pathfinding.js';
import { ItemSchema, MapSchema } from '../../../src/types/types.js';

// The real game data, so these cases track the actual world rather than a
// hand-built graph that agrees with whatever the code already does.
const maps: MapSchema[] = JSON.parse(
  fs.readFileSync('data/maps-data.json', 'utf-8'),
);
const items: ItemSchema[] = JSON.parse(
  fs.readFileSync('data/items-data.json', 'utf-8'),
);

const graph = buildNavigationGraph(maps);
const mapById = (id: number): MapSchema =>
  maps.find((map) => map.map_id === id)!;

const allPotions = buildTeleportTable(
  items.filter((item) => item.type === 'consumable'),
);
const potion = (code: string): TeleportPotion =>
  allPotions.find((entry) => entry.code === code)!;

const SPAWN = 271;
const hopsFrom = (
  mapId: number,
  target: MapSchema,
  excluded = new Set<number>(),
) =>
  buildTransitionPath(mapId, target, graph, excluded, { quiet: true })
    ?.length ?? null;

describe('the teleport table against the real item data', () => {
  it('finds every teleport potion in the game', () => {
    expect(allPotions.map((entry) => entry.code).sort()).toEqual([
      'enchanted_potion',
      'forest_bank_potion',
      'lava_underground_potion',
      'recall_potion',
      'sandwhisper_potion',
    ]);
  });

  it('lands every potion on a tile the navigation graph knows', () => {
    for (const entry of allPotions) {
      expect(graph.zoneOfMapId.get(entry.mapId)).toBeDefined();
    }
  });
});

describe('walking to each teleport destination', () => {
  // Recorded from the real map data. These are the numbers the potion has to
  // beat, and the reason none of these potions is an access key: every one of
  // these zones can already be walked to.
  it.each([
    ['enchanted_potion', 'Enchanted Forest (restricted)', 1],
    ['sandwhisper_potion', 'Sandwhisper Isle', 1],
    ['lava_underground_potion', 'Lava Underground', 3],
    ['recall_potion', 'Spawn', 0],
    ['forest_bank_potion', 'Forest bank', 0],
  ])('%s: %s is %i transitions from spawn', (code, _name, expected) => {
    expect(hopsFrom(SPAWN, mapById(potion(code as string).mapId))).toBe(
      expected,
    );
  });
});

describe('choosing a potion for each zone, standing at spawn', () => {
  it('drinks the enchanted potion to skip the gated forest transition', () => {
    const destination = mapById(potion('enchanted_potion').mapId);

    const chosen = chooseTeleportPotion(SPAWN, destination, graph, allPotions);

    expect(chosen?.code).toBe('enchanted_potion');
  });

  it('drinks the sandwhisper potion rather than sailing to the isle', () => {
    const destination = mapById(potion('sandwhisper_potion').mapId);

    const chosen = chooseTeleportPotion(SPAWN, destination, graph, allPotions);

    expect(chosen?.code).toBe('sandwhisper_potion');
  });

  it('drinks the lava potion, worth three transitions', () => {
    const destination = mapById(potion('lava_underground_potion').mapId);

    const chosen = chooseTeleportPotion(SPAWN, destination, graph, allPotions);

    expect(chosen?.code).toBe('lava_underground_potion');
  });

  it('walks to somewhere already in the spawn zone', () => {
    // The standard-access part of the Enchanted Forest shares spawn's zone, so
    // there is nothing for a potion to save
    const walkable = mapById(718);
    expect(graph.zoneOfMapId.get(718)).toBe(graph.zoneOfMapId.get(SPAWN));

    expect(
      chooseTeleportPotion(SPAWN, walkable, graph, allPotions),
    ).toBeUndefined();
  });
});

describe('coming back from each zone', () => {
  it.each([
    ['enchanted_potion', 'the enchanted forest'],
    ['sandwhisper_potion', 'sandwhisper isle'],
    ['lava_underground_potion', 'the lava underground'],
  ])('recalls to spawn from %s', (code) => {
    const away = potion(code as string).mapId;
    const spawn = mapById(SPAWN);

    const chosen = chooseTeleportPotion(away, spawn, graph, allPotions);

    // Any potion landing in the spawn zone will do; both do so in zero hops
    expect(chosen).toBeDefined();
    expect(hopsFrom(chosen!.mapId, spawn)).toBe(0);
  });
});

describe('when the character cannot pay its way', () => {
  // Every transition guarding a condition — what move() hands the pathfinder
  // for a character that can satisfy none of them
  const gated = new Set(
    maps
      .filter((map) => map.interactions.transition?.conditions?.length)
      .map((map) => map.map_id),
  );

  it('still takes the potion that lands inside the walled-off zone', () => {
    const destination = mapById(potion('enchanted_potion').mapId);

    expect(hopsFrom(SPAWN, destination, gated)).toBeNull();

    const chosen = chooseTeleportPotion(
      SPAWN,
      destination,
      graph,
      allPotions,
      gated,
    );

    expect(chosen?.code).toBe('enchanted_potion');
  });

  it('drinks nothing when every potion strands the character behind a gate', () => {
    // Lava Underground zone 5: the lava potion lands one transition short of it
    // and that transition is gated, so drinking would burn a potion for nothing.
    // Judged without the exclusions the potion looks like a four-hop saving.
    const destination = mapById(287);

    expect(hopsFrom(SPAWN, destination)).toBe(4);
    expect(hopsFrom(potion('lava_underground_potion').mapId, destination)).toBe(
      1,
    );
    expect(hopsFrom(SPAWN, destination, gated)).toBeNull();

    expect(
      chooseTeleportPotion(SPAWN, destination, graph, allPotions, gated),
    ).toBeUndefined();
  });
});
