# Navigation Zone-Graph Pathfinding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded region heuristics and bespoke movement helpers with a data-driven zone graph computed from map access types, and pathfind over it for the fewest transitions.

**Architecture:** A new `src/core/navigation/` module. `zones.ts` flood-fills maps into connected zones per layer; `graph.ts` layers transition edges between zones (and memoizes the result); `pathfinding.ts` runs a BFS over the zone graph. `Character.move()` consumes the graph; the old `TransitionPathfinder.ts` and `Movement.ts` are deleted.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), Jest (`ts-jest` ESM preset), Winston logger.

## Global Constraints

- ESM imports MUST use the `.js` suffix (e.g. `import { x } from './zones.js'`), per `tsconfig`/jest `moduleNameMapper`.
- Conditions are OUT OF SCOPE for planning. The pathfinder ignores transition conditions; only execution-time generic `gold`-cost auto-pay remains. (See `docs/navigation.md` TODO.)
- Access-type treatment: `standard`/`conditional` = walkable; `blocked`/`teleportation`/missing = boundary; `restricted` = its own isolated zones, compared as a **string literal** (the `MapAccessType` enum has no `restricted` yet).
- Cost model: minimize number of transitions; tie-break by Manhattan distance from a transition's landing tile to the target.
- Run tests with `npx jest <path>`. Typecheck with `npx tsc --noEmit`. Format with `npm run prettier:fix`.

---

## File structure

- Create `src/core/navigation/zones.ts` — zone model + `buildZones(allMaps)`.
- Create `src/core/navigation/graph.ts` — `TransitionEdge`, `NavigationGraph`, `buildNavigationGraph`, memoized `getNavigationGraph`, `resetNavigationGraphCache`.
- Create `src/core/navigation/pathfinding.ts` — `buildTransitionPath(currentMapId, target, graph, excluded)`.
- Create `tests/unit/navigation/zones.test.ts`, `graph.test.ts`, `pathfinding.test.ts`.
- Modify `src/core/Character.ts` — import + field + init wiring + `move()` call + `performTransitionStep` cleanup/reroute fix.
- Rewrite `tests/integration/CharacterMove.test.ts` — set `navigationGraph` directly via a `makeGraph` helper.
- Delete `src/core/TransitionPathfinder.ts`, `src/core/Movement.ts`, `tests/unit/TransitionPathfinder.test.ts`.
- Modify `src/utils.ts` — remove now-unused `TransitionLocations`.

---

## Task 1: Zone flood-fill (`zones.ts`)

**Files:**
- Create: `src/core/navigation/zones.ts`
- Test: `tests/unit/navigation/zones.test.ts`

**Interfaces:**
- Consumes: `MapSchema`, `MapLayer` from `src/types/types.ts`.
- Produces:
  - `type ZoneId = number`
  - `interface Zone { id: ZoneId; layer: MapLayer; mapIds: Set<number> }`
  - `interface ZoneIndex { zoneOfMapId: Map<number, ZoneId>; zones: Map<ZoneId, Zone> }`
  - `function buildZones(allMaps: MapSchema[]): ZoneIndex`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/navigation/zones.test.ts`:

```ts
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
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0),
      makeMap(2, 1, 0),
    ]);
    expect(zoneOfMapId.get(1)).toBe(zoneOfMapId.get(2));
  });

  it('splits non-adjacent walkable tiles into separate zones', () => {
    const { zoneOfMapId } = buildZones([
      makeMap(1, 0, 0),
      makeMap(2, 5, 0),
    ]);
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
    const { zoneOfMapId } = buildZones([makeMap(1, 0, 0, 'overworld', 'teleportation')]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/navigation/zones.test.ts`
Expected: FAIL — cannot find module `zones.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/navigation/zones.ts`:

```ts
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
    const isRestricted = (m: MapSchema) => m.access.type === 'restricted';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/navigation/zones.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/navigation/zones.ts tests/unit/navigation/zones.test.ts
git commit -m "feat: flood-fill maps into navigation zones"
```

---

## Task 2: Navigation graph (`graph.ts`)

**Files:**
- Create: `src/core/navigation/graph.ts`
- Test: `tests/unit/navigation/graph.test.ts`

**Interfaces:**
- Consumes: `MapSchema`; `Zone`, `ZoneId`, `ZoneIndex`, `buildZones` from `./zones.js`.
- Produces:
  - `interface TransitionEdge { fromZone: ZoneId; toZone: ZoneId; transitionPoint: MapSchema }`
  - `interface NavigationGraph { zoneOfMapId: Map<number, ZoneId>; zones: Map<ZoneId, Zone>; edges: Map<ZoneId, TransitionEdge[]> }`
  - `function buildNavigationGraph(allMaps: MapSchema[]): NavigationGraph`
  - `function getNavigationGraph(allMaps: MapSchema[]): NavigationGraph` (memoized)
  - `function resetNavigationGraphCache(): void`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/navigation/graph.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/navigation/graph.test.ts`
Expected: FAIL — cannot find module `graph.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/navigation/graph.ts`:

```ts
import { MapSchema } from '../../types/types.js';
import { buildZones, Zone, ZoneId } from './zones.js';

export interface TransitionEdge {
  fromZone: ZoneId;
  toZone: ZoneId;
  transitionPoint: MapSchema;
}

export interface NavigationGraph {
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
  /** Outgoing transition edges keyed by source zone. */
  edges: Map<ZoneId, TransitionEdge[]>;
}

export function buildNavigationGraph(allMaps: MapSchema[]): NavigationGraph {
  const { zoneOfMapId, zones } = buildZones(allMaps);
  const edges = new Map<ZoneId, TransitionEdge[]>();

  for (const map of allMaps) {
    const transition = map.interactions.transition;
    if (!transition) continue;

    const fromZone = zoneOfMapId.get(map.map_id);
    const toZone = zoneOfMapId.get(transition.map_id);
    // Skip transitions whose source or landing tile is not part of any zone
    // (e.g. it sits on a blocked/teleportation tile we do not model), or that
    // stay within the same zone.
    if (fromZone === undefined || toZone === undefined) continue;
    if (fromZone === toZone) continue;

    const list = edges.get(fromZone) ?? [];
    list.push({ fromZone, toZone, transitionPoint: map });
    edges.set(fromZone, list);
  }

  return { zoneOfMapId, zones, edges };
}

let cachedGraph: NavigationGraph | null = null;

/** Builds the navigation graph once and reuses it (identical for every character). */
export function getNavigationGraph(allMaps: MapSchema[]): NavigationGraph {
  if (!cachedGraph) cachedGraph = buildNavigationGraph(allMaps);
  return cachedGraph;
}

/** Test-only: clear the memoized graph between cases. */
export function resetNavigationGraphCache(): void {
  cachedGraph = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/navigation/graph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/navigation/graph.ts tests/unit/navigation/graph.test.ts
git commit -m "feat: build zone transition graph with memoization"
```

---

## Task 3: BFS pathfinding (`pathfinding.ts`)

**Files:**
- Create: `src/core/navigation/pathfinding.ts`
- Test: `tests/unit/navigation/pathfinding.test.ts`

**Interfaces:**
- Consumes: `MapSchema`; `NavigationGraph`, `buildNavigationGraph` from `./graph.js`; `logger` from `src/utils.ts`.
- Produces: `function buildTransitionPath(currentMapId: number, target: MapSchema, graph: NavigationGraph, excludedTransitionIds?: Set<number>): MapSchema[] | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/navigation/pathfinding.test.ts`:

```ts
import { buildTransitionPath } from '../../../src/core/navigation/pathfinding.js';
import { buildNavigationGraph } from '../../../src/core/navigation/graph.js';
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

// Overworld zone {1,2} and underground zone {3,4}. Two overworld->underground
// transitions reach the underground zone:
//   map 1 (0,0) -> map 3 (0,0) underground   [landing far from target]
//   map 2 (1,0) -> map 4 (5,0) underground   [landing near target (5,1)]
const maps = [
  makeMap(1, 0, 0, 'overworld', { map_id: 3, x: 0, y: 0, layer: 'underground' }),
  makeMap(2, 1, 0, 'overworld', { map_id: 4, x: 5, y: 0, layer: 'underground' }),
  makeMap(3, 0, 0, 'underground'),
  makeMap(4, 5, 0, 'underground'),
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
    // Target (5,1) underground is closest to map 2's landing (5,0).
    const target = makeMap(4, 5, 1, 'underground');
    const path = buildTransitionPath(1, target, graph);
    expect(path!.map((m) => m.map_id)).toEqual([2]);
  });

  it('skips an excluded transition and routes through the alternative', () => {
    const graph = buildNavigationGraph(maps);
    const target = makeMap(4, 5, 1, 'underground');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/navigation/pathfinding.test.ts`
Expected: FAIL — cannot find module `pathfinding.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/navigation/pathfinding.ts`:

```ts
import { MapSchema } from '../../types/types.js';
import { logger } from '../../utils.js';
import { NavigationGraph } from './graph.js';
import { ZoneId } from './zones.js';

const manhattan = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Ordered list of transition points to visit to get from the character's
 * current map to the target. For each returned map: walk to its (x, y), then
 * call /transition. After the last one, move directly to the target.
 *
 * Returns [] when already in the target's zone, or null when no route exists.
 * Minimises the number of transitions (BFS); ties are broken toward the
 * transition whose landing tile is closest to the target.
 */
export function buildTransitionPath(
  currentMapId: number,
  target: MapSchema,
  graph: NavigationGraph,
  excludedTransitionIds: Set<number> = new Set(),
): MapSchema[] | null {
  const startZone = graph.zoneOfMapId.get(currentMapId);
  const targetZone = graph.zoneOfMapId.get(target.map_id);

  if (startZone === undefined) {
    logger.error(`buildTransitionPath: no zone for current map ${currentMapId}`);
    return null;
  }
  if (targetZone === undefined) {
    logger.error(
      `buildTransitionPath: no zone for target ${target.name} (${target.map_id})`,
    );
    return null;
  }
  if (startZone === targetZone) return [];

  interface BFSNode {
    zone: ZoneId;
    path: MapSchema[];
  }
  const queue: BFSNode[] = [{ zone: startZone, path: [] }];
  const visited = new Set<ZoneId>([startZone]);

  while (queue.length > 0) {
    const { zone, path } = queue.shift()!;

    const outgoing = (graph.edges.get(zone) ?? [])
      .filter((e) => !excludedTransitionIds.has(e.transitionPoint.map_id))
      .sort(
        (a, b) =>
          manhattan(a.transitionPoint.interactions.transition!, target) -
          manhattan(b.transitionPoint.interactions.transition!, target),
      );

    for (const edge of outgoing) {
      if (visited.has(edge.toZone)) continue;
      const newPath = [...path, edge.transitionPoint];
      if (edge.toZone === targetZone) return newPath;
      visited.add(edge.toZone);
      queue.push({ zone: edge.toZone, path: newPath });
    }
  }

  logger.error(
    `buildTransitionPath: no path to ${target.name} (${target.x}, ${target.y}, ${target.layer})`,
  );
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/navigation/pathfinding.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/navigation/pathfinding.ts tests/unit/navigation/pathfinding.test.ts
git commit -m "feat: BFS pathfinding over the zone graph"
```

---

## Task 4: Wire the graph into `Character` and rewrite the move integration test

**Files:**
- Modify: `src/core/Character.ts` (imports ~91-98, field ~163-164, init ~289-290, `move()` 2326-2333, `performTransitionStep` 2399-2454)
- Rewrite: `tests/integration/CharacterMove.test.ts`

**Interfaces:**
- Consumes: `buildTransitionPath` from `./navigation/pathfinding.js`; `getNavigationGraph`, `NavigationGraph` from `./navigation/graph.js`.
- Produces: `Character.navigationGraph: NavigationGraph` (public field, settable by tests).

- [ ] **Step 1: Replace the old imports**

In `src/core/Character.ts`, replace this block (currently ~lines 91-98):

```ts
import {
  transitionToMainland,
  transitionToSandwhisperIsle,
} from './Movement.js';
import {
  buildTransitionPath,
  SANDWHISPER_Y_BOUNDARY,
} from './TransitionPathfinder.js';
```

with:

```ts
import { buildTransitionPath } from './navigation/pathfinding.js';
import {
  getNavigationGraph,
  NavigationGraph,
} from './navigation/graph.js';
```

- [ ] **Step 2: Add the field and remove the unused `transitionLocations` field**

In `src/core/Character.ts`, replace (currently ~lines 163-164):

```ts
  allMaps: MapSchema[];
  transitionLocations: MapSchema[];
```

with:

```ts
  allMaps: MapSchema[];
  navigationGraph: NavigationGraph;
```

- [ ] **Step 3: Wire the graph in `init` and drop the `transitionLocations` build**

In `src/core/Character.ts`, replace (currently ~lines 289-290):

```ts
    this.allMaps = await AllMaps();
    this.transitionLocations = TransitionLocations(this.allMaps);
```

with:

```ts
    this.allMaps = await AllMaps();
    this.navigationGraph = getNavigationGraph(this.allMaps);
```

Then remove the now-unused `TransitionLocations` import from the top of `src/core/Character.ts` (the line `  TransitionLocations,` inside the `from '../utils.js'` import group near line 46).

- [ ] **Step 4: Update the `move()` pathfinding call**

In `src/core/Character.ts` `move()`, replace (currently ~lines 2326-2333):

```ts
      const transitionPath = buildTransitionPath(
        this.data.x,
        this.data.y,
        this.data.layer as MapLayer,
        destination,
        this.transitionLocations,
        excludedTransitionIds,
      );
```

with:

```ts
      const transitionPath = buildTransitionPath(
        this.data.map_id,
        destination,
        this.navigationGraph,
        excludedTransitionIds,
      );
```

- [ ] **Step 5: Simplify `performTransitionStep` (remove Sandwhisper branches, fix reroute)**

In `src/core/Character.ts`, replace the doc comment + Sandwhisper branches + condition loop (currently ~lines 2399-2454). The block to replace starts at the `/**` above `performTransitionStep` and ends at the closing `}` of the `if (transition.conditions) { ... }` loop. Replace:

```ts
  /**
   * @description Moves to a transition point and executes the transition.
   * Handles Sandwhisper Isle overworld↔mainland transitions via dedicated wrappers (for recall
   * potion logic). All other transitions are handled generically, checking gold cost conditions.
   */
  private async performTransitionStep(
    transitionPoint: MapSchema,
  ): Promise<TransitionStepResult> {
    const transition = transitionPoint.interactions.transition;
    if (!transition) {
      logger.error(
        `Map ${transitionPoint.map_id} at (${transitionPoint.x}, ${transitionPoint.y}) has no transition data`,
      );
      return { ok: false, reroute: false };
    }

    // Sandwhisper Isle: mainland overworld -> island overworld
    if (
      transitionPoint.layer === MapLayer.overworld &&
      transitionPoint.y < SANDWHISPER_Y_BOUNDARY &&
      transition.layer === MapLayer.overworld &&
      transition.y >= SANDWHISPER_Y_BOUNDARY
    ) {
      return (await transitionToSandwhisperIsle(this))
        ? { ok: true }
        : { ok: false, reroute: false };
    }

    // Sandwhisper Isle: island overworld -> mainland overworld
    if (
      transitionPoint.layer === MapLayer.overworld &&
      transitionPoint.y >= SANDWHISPER_Y_BOUNDARY &&
      transition.layer === MapLayer.overworld &&
      transition.y < SANDWHISPER_Y_BOUNDARY
    ) {
      return (await transitionToMainland(this))
        ? { ok: true }
        : { ok: false, reroute: false };
    }

    // Generic transition: handle any gold cost conditions
    if (transition.conditions) {
      for (const condition of transition.conditions) {
        if (
          condition.operator === ConditionOperator.cost &&
          condition.code === 'gold'
        ) {
          await this.withdrawNow(condition.value, 'gold');
        } else {
          logger.warn(
            `Unsupported transition condition at (${transitionPoint.x}, ${transitionPoint.y}): ${JSON.stringify(condition)}`,
          );
          return { ok: false, reroute: false };
        }
      }
    }
```

with:

```ts
  /**
   * @description Moves to a transition point and executes the transition.
   * Conditions are handled generically: a plain gold cost is auto-paid; any other
   * condition we cannot yet satisfy triggers a reroute so move() tries another exit.
   */
  private async performTransitionStep(
    transitionPoint: MapSchema,
  ): Promise<TransitionStepResult> {
    const transition = transitionPoint.interactions.transition;
    if (!transition) {
      logger.error(
        `Map ${transitionPoint.map_id} at (${transitionPoint.x}, ${transitionPoint.y}) has no transition data`,
      );
      return { ok: false, reroute: false };
    }

    // Generic transition: auto-pay a gold cost; reroute around anything else.
    if (transition.conditions) {
      for (const condition of transition.conditions) {
        if (
          condition.operator === ConditionOperator.cost &&
          condition.code === 'gold'
        ) {
          await this.withdrawNow(condition.value, 'gold');
        } else {
          logger.warn(
            `Unsupported transition condition at (${transitionPoint.x}, ${transitionPoint.y}): ${JSON.stringify(condition)} — rerouting`,
          );
          return { ok: false, reroute: true };
        }
      }
    }
```

(Leave everything from `logger.info(\`Moving to transition point ...\`)` onward unchanged.)

- [ ] **Step 6: Typecheck the source changes**

Run: `npx tsc --noEmit`
Expected: No errors. (If `MapLayer` is now unused in `Character.ts`, remove it from its import; if any other reference to `transitionToSandwhisperIsle`/`transitionToMainland`/`SANDWHISPER_Y_BOUNDARY`/`transitionLocations` remains, the compiler will flag it — fix those lines.)

- [ ] **Step 7: Rewrite the move integration test setup helper**

In `tests/integration/CharacterMove.test.ts`, add imports after the existing type import block:

```ts
import { NavigationGraph, TransitionEdge } from '../../src/core/navigation/graph.js';
import { Zone, ZoneId } from '../../src/core/navigation/zones.js';

// Builds a NavigationGraph from explicit zone assignments and edges, so the
// move() mechanics can be tested without depending on flood-fill geometry.
function makeGraph(
  zoneAssignments: Record<number, ZoneId>,
  edges: { from: ZoneId; to: ZoneId; transitionPoint: MapSchema }[] = [],
): NavigationGraph {
  const zoneOfMapId = new Map<number, ZoneId>();
  const zones = new Map<ZoneId, Zone>();
  for (const [mapIdStr, zoneId] of Object.entries(zoneAssignments)) {
    const mapId = Number(mapIdStr);
    zoneOfMapId.set(mapId, zoneId);
    const zone =
      zones.get(zoneId) ?? { id: zoneId, layer: 'overworld', mapIds: new Set<number>() };
    zone.mapIds.add(mapId);
    zones.set(zoneId, zone);
  }
  const edgeMap = new Map<ZoneId, TransitionEdge[]>();
  for (const e of edges) {
    const list = edgeMap.get(e.from) ?? [];
    list.push({ fromZone: e.from, toZone: e.to, transitionPoint: e.transitionPoint });
    edgeMap.set(e.from, list);
  }
  return { zoneOfMapId, zones, edges: edgeMap };
}
```

- [ ] **Step 8: Convert each test's setup from `transitionLocations` to `navigationGraph`**

Keep all `beforeEach` mock wiring (`jest.clearAllMocks`, `withdrawNow` mock) but **delete** the `character.transitionLocations = [ ... ]` assignment at the end of `beforeEach` (lines ~74-175). Then set the graph per test as follows. The transition-point objects referenced below are plain `MapSchema` literals — define them inline in each test (each already exists in the current file as a `transitionLocations` entry; reuse those literals as the `transitionPoint`).

- **"should move successfully within overworld layer"** — add before `// Act`:
  ```ts
  character.navigationGraph = makeGraph({ 91: 0, 100: 0 });
  ```
- **"should move successfully within underground layer"** — replace the `character.transitionLocations = [ ... ]` block with:
  ```ts
  character.navigationGraph = makeGraph({ 91: 0, 200: 0 });
  ```
- **"should return true immediately if already at destination (same coordinates)"** and **"(same map_id)"** — add:
  ```ts
  character.navigationGraph = makeGraph({ 91: 0 });
  ```
- **"should transition from overworld to underground"** — add:
  ```ts
  const mountain: MapSchema = {
    map_id: 571, name: 'Mountain', skin: 'mountain_6', x: -2, y: 6, layer: 'overworld',
    access: { type: 'standard', conditions: [] },
    interactions: { transition: { map_id: 572, x: -2, y: 6, layer: 'underground', conditions: [] } },
  };
  character.navigationGraph = makeGraph(
    { 91: 0, 571: 0, 572: 1, 521: 1 },
    [{ from: 0, to: 1, transitionPoint: mountain }],
  );
  const transitionLocation = mountain; // used later in the assertions
  ```
  (Delete the existing `const transitionLocation = character.transitionLocations[0];` line.)
- **"should skip actionMove when already standing on the interior exit transition point"** — replace the `character.transitionLocations = [interiorExit, otherInteriorExit];` line with:
  ```ts
  // Disconnected interiors are different zones, so only interiorExit's edge is in the character's zone.
  character.navigationGraph = makeGraph(
    { 800: 0, 802: 2, 801: 1, 803: 1, 900: 1 },
    [
      { from: 0, to: 1, transitionPoint: interiorExit },
      { from: 2, to: 1, transitionPoint: otherInteriorExit },
    ],
  );
  ```
- **"should handle move API error"** — add before `// Act`:
  ```ts
  character.navigationGraph = makeGraph({ 91: 0, 600: 0 });
  ```
- **"should handle transition API error"** — add:
  ```ts
  const mountain: MapSchema = {
    map_id: 571, name: 'Mountain', skin: 'mountain_6', x: -2, y: 6, layer: 'overworld',
    access: { type: 'standard', conditions: [] },
    interactions: { transition: { map_id: 572, x: -2, y: 6, layer: 'underground', conditions: [] } },
  };
  character.navigationGraph = makeGraph(
    { 91: 0, 571: 0, 572: 1, 700: 1 },
    [{ from: 0, to: 1, transitionPoint: mountain }],
  );
  ```
  (Replace `destination: character.transitionLocations[0],` in the mock with `destination: mountain,`.)
- **"should handle missing character data in move response"** — add:
  ```ts
  character.navigationGraph = makeGraph({ 91: 0, 800: 0 });
  ```
- **"excludes the blocked transition and reaches the destination via an alternative exit"** (reroute test) — replace `character.transitionLocations = [nearExit, farExit];` with:
  ```ts
  character.navigationGraph = makeGraph(
    { 950: 0, 901: 0, 903: 0, 902: 1, 904: 1, 800: 1 },
    [
      { from: 0, to: 1, transitionPoint: nearExit },
      { from: 0, to: 1, transitionPoint: farExit },
    ],
  );
  ```
- **"should return true for Sandwhisper Isle destination"** — add:
  ```ts
  const forestBoat: MapSchema = {
    map_id: 1093, name: 'Forest', skin: 'forest_coastline1', x: 2, y: 16, layer: 'overworld',
    access: { type: 'standard', conditions: [] },
    interactions: { transition: { map_id: 1336, x: -2, y: 21, layer: 'overworld', conditions: [{ code: 'gold', operator: 'cost', value: 1000 }] } },
  };
  character.navigationGraph = makeGraph(
    { 91: 0, 1093: 0, 1336: 1, 1285: 1 },
    [{ from: 0, to: 1, transitionPoint: forestBoat }],
  );
  ```
  (Replace `destination: character.transitionLocations[0],` in the mock with `destination: forestBoat,`.)

- [ ] **Step 9: Run the move integration test**

Run: `npx jest tests/integration/CharacterMove.test.ts`
Expected: PASS. The previously-disabled stub (`should transition from underground to overworld`) still trivially passes; the commented-out block stays commented.

- [ ] **Step 10: Commit**

```bash
git add src/core/Character.ts tests/integration/CharacterMove.test.ts
git commit -m "feat: route Character.move through the zone navigation graph"
```

---

## Task 5: Delete the old pathfinder, movement helpers, and dead util

**Files:**
- Delete: `src/core/TransitionPathfinder.ts`, `src/core/Movement.ts`, `tests/unit/TransitionPathfinder.test.ts`
- Modify: `src/utils.ts` (remove `TransitionLocations`)

**Interfaces:** None produced. This task removes code made dead by Task 4.

- [ ] **Step 1: Confirm nothing still imports the old modules**

Run:
```bash
grep -rn "TransitionPathfinder\|from './Movement\|from '../core/Movement\|SANDWHISPER_Y_BOUNDARY\|transitionToSandwhisperIsle\|transitionToMainland\|transitionToUndergroundMine\|transitionToOverworld\|transitionToSandwhisperMine\|transitionFromSandwhisperMine\|TransitionLocations\|\.transitionLocations" src/ tests/
```
Expected: No matches (Task 4 removed the last references). If any appear, fix them before deleting.

- [ ] **Step 2: Delete the dead files**

```bash
git rm src/core/TransitionPathfinder.ts src/core/Movement.ts tests/unit/TransitionPathfinder.test.ts
```

- [ ] **Step 3: Remove the unused `TransitionLocations` util**

In `src/utils.ts`, delete the `TransitionLocations` function (currently ~lines 31-44, the `/** ... Array of all transition maps */` doc comment through the closing `}`).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run the full test suite**

Run: `npx jest`
Expected: All suites pass, including the three new `tests/unit/navigation/*` suites and the rewritten `CharacterMove` suite. No reference to deleted modules.

- [ ] **Step 6: Format**

Run: `npm run prettier:fix`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove hardcoded region heuristics and bespoke movement helpers"
```

---

## Self-review notes

- **Spec coverage:** zones (Task 1), restricted/teleportation handling (Task 1), transition graph + memoization (Task 2), fewest-transitions BFS + tie-break + exclude/reroute (Task 3), `move()`/`performTransitionStep` integration + reroute-on-unsupported-condition + graph wiring (Task 4), deletion of `TransitionPathfinder.ts`/`Movement.ts`/`SANDWHISPER_Y_BOUNDARY` (Task 5). The lava-underground regression is exercised by the pathfinding "disconnected zones" unit tests (distinct zones ⇒ correct entrance) and the interior-exit integration test.
- **Conditions deferral:** planning ignores conditions (edges added regardless); execution keeps gold auto-pay and now reroutes on unsatisfiable conditions. Matches the spec's deferred boundary.
- **Type consistency:** `buildZones → ZoneIndex`; `buildNavigationGraph/getNavigationGraph → NavigationGraph`; `buildTransitionPath(currentMapId, target, graph, excluded) → MapSchema[] | null`. `Character.navigationGraph: NavigationGraph` consumed by `move()`.
