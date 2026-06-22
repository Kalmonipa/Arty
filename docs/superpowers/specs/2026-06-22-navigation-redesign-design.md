# Navigation Redesign — Zone-Graph Pathfinding

**Date:** 2026-06-22
**Status:** Design — approved, pending implementation plan

## Problem

ArtifactsMMO now uses [transitions](https://docs.artifactsmmo.com/concepts/maps_and_movement/#transition):
to reach many maps you must walk to a transition point, call `/action/transition`, then move again
(possibly through further transitions). The current navigation has two parts and both are too coarse:

- **Planning brain** — `src/core/TransitionPathfinder.ts`. Decides whether two tiles are mutually
  walkable using hardcoded heuristics: a magic `SANDWHISPER_Y_BOUNDARY = 17` plus `layer`. Every
  underground tile with `y < 17` is collapsed into one region `underground:mainland`.
- **Execution layer** — `Character.performTransitionStep` plus six bespoke `Movement.ts` helpers
  (`transitionToSandwhisperIsle`, `transitionToUndergroundMine`, …) that hand-pick transition points
  by matching layer/y conditions and handle gold/potion acquisition.

### Concrete failure

Routing from the mainland Forest (map 274, overworld) to the Lava Underground (map 497, underground)
fails. Three compounding causes:

1. **Region model too coarse (root cause).** The Lava Underground is a _physically disconnected_
   underground area, but `getRegionKey` treats all `underground, y < 17` tiles as one region, so the
   pathfinder believes (7,4) underground is a normal walk from the standard mine. It is not.
2. **Distance heuristic picks a poisoned exit.** BFS sorts candidate transitions by Manhattan
   distance from their landing tile to the target. The Graveyard → underground transition lands at
   (9,7), only ~5 tiles from (7,4) in raw coordinates, so it looks best — even though it is gated
   behind a `lich_tomb_key` cost.
3. **An unusable transition kills the whole route.** `performTransitionStep` returns
   `{ ok: false, reroute: false }` for any non-gold condition, so `move()` gives up entirely instead
   of excluding that transition and trying another exit.

## Goals

- Replace the hardcoded region heuristics with zones derived from map data (`access.type`).
- Pathfind over a zone graph for the **fewest transitions**.
- Self-heal around transitions that cannot currently be used (reroute instead of hard-fail).
- Delete `SANDWHISPER_Y_BOUNDARY` and the six bespoke `Movement.ts` helpers.

## Non-goals (deferred)

- **Transition conditions** (`has_item`, item/gold `cost`, `achievement_unlocked`) are out of scope
  for planning. The pathfinder ignores conditions and assumes transitions are traversable. See the
  TODO in `docs/navigation.md`. Follow-up work: satisfiable-pruning, then requirement acquisition.
- **Recall-potion optimization** (teleporting home instead of taking the boat) is dropped in v1 and
  folded into the deferred conditions work. Correctness is preserved because the boat route still
  works via the generic gold auto-pay.
- **Cost model beyond hop count.** We minimize number of transitions, tie-broken by walking distance;
  we do not minimize total cooldown time.

## Approach

**Grid flood-fill zones.** Treat each layer as a 2D grid keyed by `(x, y)`. A tile is _walkable_ if a
map exists there with `access.type ∈ { standard, conditional }`. Flood-fill 4-connected walkable tiles
into connected components; each component is a zone. This mirrors exactly what the game's `move()` can
reach (it pathfinds server-side and returns 595 when no walkable path exists), so a zone is precisely
"everywhere reachable without a transition." Disconnected areas like the Lava Underground become their
own zones automatically, with no magic constants.

**Access-type treatment (decided):**

- `standard`, `conditional` → walkable (part of a zone). Conditions are ignored for v1.
- `blocked`, `teleportation` → boundaries; never walkable, never part of a zone. (`teleportation` is
  treated conservatively as a boundary for now; revisit if it turns out to gate legitimate routes.)
- `restricted` → its own isolated zones. It connects only to other `restricted` tiles (a separate
  flood-fill pass), reachable from normal zones only via transition edges — matching "restricted maps
  cannot communicate with normal maps." **`restricted` is beta-only today and absent from the
  checked-in `MapAccessType` enum**, so the code compares `access.type` as a string literal rather than
  depending on the enum member. It is implemented now so it works when the type lands on production.
- Missing coordinates (no map) are boundaries.

Alternatives rejected: a smarter transition-only graph (deciding mutual walkability _is_ the
connected-components problem — back to heuristics); lazy/reactive discovery via `move()` 595s (too
many wasted API calls, non-deterministic).

## Components

New module `src/core/navigation/`:

- `ZoneMap.ts` — builds zones from `allMaps` (flood-fill).
- `ZoneGraph.ts` — builds the zone→zone transition graph and runs BFS pathfinding.
- `index.ts` — memoized `getNavigationGraph(allMaps)` that builds both **once** and caches them (the
  graph is identical for every character, so we stop recomputing it per `Character.init`).

`src/core/TransitionPathfinder.ts` and `src/core/Movement.ts` are deleted; `SANDWHISPER_Y_BOUNDARY` and
the six bespoke helpers go with them.

### Data model

```ts
type ZoneId = number; // connected-component index

interface Zone {
  id: ZoneId;
  layer: MapLayer;
  mapIds: Set<number>; // maps in this connected component
}

interface TransitionEdge {
  fromZone: ZoneId;
  toZone: ZoneId;
  transitionPoint: MapSchema; // the source map you stand on + call /transition
}

interface NavigationGraph {
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
  edges: Map<ZoneId, TransitionEdge[]>; // outgoing edges per zone
}
```

### Zone-building algorithm (`ZoneMap.ts`)

1. Partition `allMaps` by `layer`.
2. Per layer, index maps by `(x, y)`; mark a tile walkable if `access.type ∈ { standard, conditional }`.
3. Flood-fill 4-connected walkable tiles → assign each component a `ZoneId`. `blocked` tiles and
   missing coordinates are boundaries.
4. `restricted` tiles flood-fill among themselves into their own zones.

### Graph-building (`ZoneGraph.ts`)

For every map with `interactions.transition`, add an edge `zoneOf(sourceMap) → zoneOf(transition.map_id)`,
carrying the source map as `transitionPoint`. Multiple transition points between the same pair of zones
produce multiple edges. Transition conditions are ignored at this stage (deferred).

### Pathfinding (`ZoneGraph.ts`)

Keeps the existing return contract so `move()` barely changes:

```ts
buildTransitionPath(currentMapId, target, graph, excludedTransitionIds): MapSchema[] | null
```

1. `startZone = zoneOfMapId(currentMapId)`, `targetZone = zoneOfMapId(target.map_id)`.
2. Same zone → return `[]` (caller does a direct `move()`).
3. BFS over zones: queue of `{ zoneId, path: TransitionEdge[] }`, `visited: Set<ZoneId>`. For each
   zone, walk its outgoing edges, skipping any whose `transitionPoint.map_id` is in
   `excludedTransitionIds`. An edge reaching `targetZone` → return `path` mapped to `transitionPoint`s.
   BFS guarantees fewest transitions.
4. Tie-break: sort each zone's edges by Manhattan distance from `transitionPoint` → target (greedy
   toward the goal — now only a tie-breaker, not the primary metric).
5. No path → `null` + log.

The current "standing on a transition point" fast-path is dropped — it was a workaround for the
heuristic picking physically-unreachable exits, and the zone model makes it unnecessary (every
transition point in your zone is genuinely walkable to).

### `move()` / `performTransitionStep` integration (Character.ts)

- `move()`: unchanged shape — get path, walk each transition (existing exclude-and-reroute loop,
  max 3 attempts), final `actionMove` to the target. Calls the new
  `buildTransitionPath(this.data.map_id, …)`.
- `performTransitionStep`: delete both Sandwhisper branches; keep the generic `gold`-cost auto-pay;
  change the unsupported-condition case from `{ ok: false, reroute: false }` to **`reroute: true`** so
  the route self-heals around a gate it cannot open.
- Graph comes from a memoized `getNavigationGraph(this.allMaps)` in `Character.init`.

## v1 assumptions (also tracked as TODOs)

- `conditional` tiles are treated as walkable (condition ignored).
- `teleportation` tiles are treated as boundaries (not walkable).
- `restricted` is handled defensively via string comparison (the enum lacks it today).
- Transition edges are added regardless of their conditions (planning ignores conditions).
- These are revisited in the deferred conditions work.

## Notes for the integration test

`Character.move()` now consumes a `NavigationGraph` (built from `allMaps`) instead of the flat
`transitionLocations` array. Because flood-fill needs contiguous coordinates, the existing
`CharacterMove` integration tests — which use sparse, non-adjacent map fixtures — set
`character.navigationGraph` directly through a small `makeGraph` helper that assigns map_ids to zones
explicitly. This keeps the integration tests focused on the move/transition API-call sequence and
leaves flood-fill correctness to the `zones` unit tests. The "standing on the interior exit" case
resolves naturally: disconnected interior maps become distinct zones, so only the correct exit's edge
is in the character's zone.

## Edge cases

- Target `map_id` not in `zoneOfMapId` (blocked/unknown) → `null`.
- Character on a blocked/unknown map → guard and log.
- Excluded transitions exhaust all routes → `null` after reroute attempts.
- **Destination only reachable via a conditional transition.** Because conditions are deferred, if the
  only edge into the target's zone is gated (e.g. a `lich_tomb_key` cost), v1 cannot complete the
  route. This is expected and acceptable: it must fail _cleanly_ (`null` path → `move()` returns false
  → caller handles it), not crash or loop. The lava-underground fix assumes that zone has at least one
  non-conditional entrance; the regression test uses fixtures with such an entrance. Reaching
  conditional-only destinations is part of the deferred conditions work.

## Testing (test-first)

Unit (`tests/unit/`, extending/replacing `TransitionPathfinder.test.ts`):

- `ZoneMap`: blocked boundary → two zones; restricted cluster → its own zone; **disconnected
  same-layer underground areas → distinct zones** (the lava-underground regression, asserted directly).
- `ZoneGraph`: transitions produce correct edges, including multiple edges between the same pair.
- `buildTransitionPath`: same-zone → `[]`; multi-hop fewest-transitions; **Forest(274) → Lava
  Underground(497) routes via the real entrance, not the lich tomb**; unreachable → `null`; excluded
  transition forces an alternate route.

Integration (`tests/integration/CharacterMove.test.ts`): update for the removed helpers; assert
reroute-on-unsupported-condition.
