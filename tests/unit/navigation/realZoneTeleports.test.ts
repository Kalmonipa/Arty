import {
  buildTeleportTable,
  chooseTeleportPotion,
  TeleportPotion,
} from '../../../src/core/navigation/teleports.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
import { buildTransitionPath } from '../../../src/core/navigation/pathfinding.js';
import { journeySeconds } from '../../../src/core/navigation/teleports.js';
import { ItemSchema, MapSchema } from '../../../src/types/types.js';
import { loadMaps, loadConsumables } from '../../fixtures/gameData.js';

// The real game data, so these cases track the actual world rather than a
// hand-built graph that agrees with whatever the code already does.
const maps = loadMaps();
const items = loadConsumables();

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

  it('drinks a potion even for a destination in its own zone, when that is quicker', () => {
    // Spawn and the item task master share a zone, so no transition is needed
    // and hop counting saw nothing to do — but it is a seventeen tile walk, and
    // the forest bank potion lands three tiles away.
    const taskMaster = mapById(946);
    expect(graph.zoneOfMapId.get(946)).toBe(graph.zoneOfMapId.get(SPAWN));
    expect(journeySeconds(SPAWN, taskMaster, graph)).toBe(85);

    const chosen = chooseTeleportPotion(SPAWN, taskMaster, graph, allPotions);

    expect(chosen?.code).toBe('forest_bank_potion');
    expect(journeySeconds(chosen!.mapId, taskMaster, graph)).toBe(15);
  });

  it('leaves a potion alone when walking is already quicker', () => {
    // Spawn to the forest bank is twenty tiles; no potion lands nearer
    const bank = mapById(955);

    expect(
      chooseTeleportPotion(SPAWN, bank, graph, [potion('recall_potion')]),
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

/**
 * The everyday case: a character mining gold at map 83 (underground) is sent to
 * the item task master at map 946 (overworld) to hand in a gather task.
 *
 * Movement costs 5s per tile and using a potion costs 3s, both confirmed
 * against live cooldowns. The routes available are:
 *
 *   walk only            1 tile to the transition + 17 tiles the far side  = 90s + transition
 *   recall_potion        3s + 17 tiles from spawn (0,0)                    = 88s
 *   forest_bank_potion   3s + 3 tiles from the forest bank (7,13)          = 18s
 */
describe('mining gold at map 83, handing in at the task master on map 946', () => {
  const MOVE_SECONDS_PER_TILE = 5;
  const POTION_SECONDS = 3;

  const tilesBetween = (a: MapSchema, b: MapSchema) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const goldRocks = mapById(83);
  const taskMaster = mapById(946);

  it('leaves the character three tiles from the task master', () => {
    const chosen = chooseTeleportPotion(
      goldRocks.map_id,
      taskMaster,
      graph,
      allPotions,
    );

    expect(chosen?.code).toBe('forest_bank_potion');

    const walkAfter = tilesBetween(mapById(chosen!.mapId), taskMaster);
    expect(walkAfter).toBe(3);
    expect(POTION_SECONDS + walkAfter * MOVE_SECONDS_PER_TILE).toBe(18);
  });

  it('picks the potion that lands nearest, not merely one in the right zone', () => {
    // recall_potion and forest_bank_potion both land in the task master's zone,
    // so hop count alone cannot separate them — but recall leaves a 17 tile walk
    const recallWalk = tilesBetween(
      mapById(potion('recall_potion').mapId),
      taskMaster,
    );
    const bankWalk = tilesBetween(
      mapById(potion('forest_bank_potion').mapId),
      taskMaster,
    );

    expect(recallWalk).toBe(17);
    expect(bankWalk).toBe(3);

    const chosen = chooseTeleportPotion(
      goldRocks.map_id,
      taskMaster,
      graph,
      allPotions,
    );

    expect(tilesBetween(mapById(chosen!.mapId), taskMaster)).toBe(bankWalk);
  });
});

describe('only drinking when the saving is worth the potion', () => {
  it('declines a saving too small to pay for crafting the potion', () => {
    // Spawn to the walkable part of the Enchanted Forest: 65s on foot against
    // 18s with the potion. A 47s saving does not cover replacing the potion.
    const walkable = mapById(718);

    expect(journeySeconds(SPAWN, walkable, graph)).toBe(65);
    expect(
      chooseTeleportPotion(SPAWN, walkable, graph, allPotions),
    ).toBeUndefined();
  });

  it('still drinks when the saving is large', () => {
    // Gold rocks to the item task master: 95s on foot against 18s, a 77s saving
    const taskMaster = mapById(946);

    expect(journeySeconds(83, taskMaster, graph)).toBe(95);
    expect(chooseTeleportPotion(83, taskMaster, graph, allPotions)?.code).toBe(
      'forest_bank_potion',
    );
  });

  it('drinks regardless of the saving when there is no way to walk there', () => {
    // A threshold that talked the character out of the only route would strand
    // it, so an impossible walk still takes any potion that reaches
    const gated = new Set(
      maps
        .filter((map) => map.interactions.transition?.conditions?.length)
        .map((map) => map.map_id),
    );
    const forest = mapById(potion('enchanted_potion').mapId);

    expect(journeySeconds(SPAWN, forest, graph, gated)).toBeNull();
    expect(
      chooseTeleportPotion(SPAWN, forest, graph, allPotions, gated)?.code,
    ).toBe('enchanted_potion');
  });
});
