# Running the whole fleet in one process

An assessment of collapsing the five per-character containers into a single
process holding five `Character` instances.

## The short answer

The instinct is right about the object model and wrong about the ambient state.

`Character` is already a properly instance-scoped class — `jobList`, `activeJob`,
`data`, and the item maps all hang off `this`. `executeJobList()`
(`src/character/character.ts:1394`) is an `async while (true)` loop made entirely
of awaits, so five of them run concurrently in one Node process without any
changes to the loop itself. `GetCharacterData()` (`src/utils.ts:369`) _already_
fetches all five characters on startup; `main.ts:32` just throws four of them
away. Constructing five instances genuinely is close to a loop around the
existing bootstrap.

What breaks is everything that currently answers the question "who am I?" by
reading a module-level constant instead of asking the instance. That is the real
work, and it is concentrated in three places rather than spread everywhere —
which is what makes this tractable.

The honest summary: **a medium refactor, not a rewrite, and worth doing for one
specific reason** — it is the only way to build a real client-side rate limiter.
See "Is it worth it" at the end.

## What already works unchanged

Worth stating explicitly, because it is most of the system:

- **Per-character job queues.** Persisted as `job_queue_${data.name}.json`
  (`character.ts:408`), already keyed by name.
- **Wishlist claiming.** A conditional `UPDATE ... WHERE executing = false`
  (`src/wishlist/wishlist.utils.ts:244`). Postgres arbitrates this identically
  whether the contenders are five processes or five promises.
- **Boss and raid coordination.** `fights_done` and fight state live in the
  `boss_fights` table (`src/fightBosses/bossFight.utils.ts`). Polled, not pushed,
  so it does not care where the participants run.
- **Metrics labels.** Every metric already carries a `character` label
  (`src/metrics.ts:16,23,37,48,60,67`). Dashboards survive untouched.
- **Per-character cooldowns and 486 handling.** `character.ts:4530` sleeps on
  `this.data.cooldown` — already instance state.

## The four real blockers

### 1. Ambient identity — the big one

Three module-level singletons decide who the process is:

| What           | Where                  | Problem                                |
| -------------- | ---------------------- | -------------------------------------- |
| `CharName`     | `src/constants.ts:30`  | `getEnv('CHARACTER_NAME')`             |
| `CharRole`     | `src/constants.ts:31`  | `getEnv('ROLE')`                       |
| logger default | `src/utils.ts:114-115` | `defaultMeta: { character: CharName }` |

`character.ts:470` does `this.role = CharRole`, so all five instances would come
up with the same role. That one is easy — make it a constructor argument.

The logger is the expensive one. Both formats fall back to `CharName`
(`utils.ts:93` and `utils.ts:107`), and there are **782 `logger.*` call sites**
that pass no character. Rewriting them all is not realistic.

**The fix is `AsyncLocalStorage`.** Run each character's `executeJobList()` inside
`als.run({ name, role }, ...)`, then have the winston format and the metric
labels read the store instead of the constant. Async context propagates through
awaits, so all 782 call sites keep working untouched. The same store fixes the
metric labels at `src/api_calls/request.ts:177` and
`src/api_calls/Actions.ts:295,301`.

Two things to watch with ALS:

- Express handlers are a separate entry point and need their own `als.run`
  wrapper, with the character resolved from the route.
- Context is lost if a promise is created outside the context and awaited
  inside, or across an `EventEmitter` registered at module load. The raid
  polling loops and any shared timers need an audit for this. A log line
  attributed to the wrong character is a quiet, nasty bug.

### 2. Blast radius

Today the container boundary is doing real isolation work that would silently
disappear:

- `process.exit(1)` on DB failure (`main.ts:43`) and `process.exit(-1)` on a pool
  error (`db.ts:21`) currently kill one character. Combined, they kill the fleet.
- An unhandled rejection anywhere in one character's job tree takes down all
  five.
- Docker's per-character restart policy is gone.

This needs a supervisor: each character's loop wrapped in catch-and-restart, so
one character's crash is logged and restarted rather than fatal. The two
`process.exit` calls need to become per-character failures.

### 3. The HTTP surface

Fourteen routers are mounted at the root, each closed over the single `char`
(`main.ts:73-86`). Five characters need either namespacing (`/char/:name/...`)
or five Express apps on five ports.

`src/api_calls/Account.ts` calls peers over Docker service-name DNS —
`http://${charName}:3000/...` at lines 20, 45, 79 and 119. In one process these
become direct method calls, which is simpler and faster. Note that only
`requestLoadout` is actually used (`src/fightBosses/bossfightPreRequisite.ts:73`);
`pauseCharacter`, `resumeCharacter` and `requestCraft` are dead code and can just
be deleted.

### 4. Log and observability workflow

Winston writes to `./logs/arty-%DATE%.log` and compose mounts a per-character
host directory. One process means one interleaved file. The `character` field is
on every line so filtering still works, but the "tail this character's log"
workflow breaks, and so does the `~/Docker/Arty/logs/<charname>/` layout.

This matters more than it sounds. A livelocked character produced **108MB of log
in 20 minutes** in the most recent rate-limit episode. Interleaved, that makes
every other character's logs unreadable at exactly the moment you need them.

Recommend a per-character winston transport keyed off the ALS store, which keeps
the current on-disk layout and the existing debugging habits intact.

Prometheus goes from five scrape targets to one — a scrape config change only,
since the labels already exist.

## Shared caches: mostly the point, partly a hazard

Every module-level cache becomes fleet-wide. This is the main prize and needs
deliberate thought rather than being allowed to happen by accident.

**Straightforwardly good** — static game data, currently paid for five times over:
`Items.ts:100`, `Resources.ts:16,22`, `Monsters.ts:17,32`, `NPC.ts:23`,
`navigation/graph.ts:46`, `events.cache.ts:25`. As a bonus, `Character.init()`
(`character.ts:415-445`) builds eleven item maps plus monster and resource data;
for characters two through five that becomes nearly free.

**Good, with a caveat** — `src/bank/bankQuantity.cache.ts`. The bank is
account-wide, so one shared memo across five characters is not just safe, it is
_more correct_ than today: one character's deposit currently leaves the other
four containers holding stale numbers for the full TTL, and in one process that
invalidation would be immediate and automatic. This is also the single largest
traffic reduction available.

The caveat is `BankCache`. Snapshots are deliberately handed out per-caller so
each can "spend down" its planned withdrawals without another caller seeing
them. With five characters planning concurrently against one bank, two can both
plan to take the last of something. That race exists across containers today, so
it is not new — but co-locating puts the characters in tighter lockstep and will
make it more likely.

**Safe, but needs resizing** — `fightSimulationCache.ts:20` is content-addressed
on a key that already includes every character's level and equipment, so five
characters share it safely and identical loadouts share hits. But
`FIGHT_SIMULATION_CACHE_LIMIT = 500` (line 26) was sized against "62 distinct
payloads a day" from _one_ character. Raise it.

**Needs hoisting** — those eleven item maps are per-instance, so five copies of
identical catalogues sit in memory. Worth promoting to a shared module-level
catalogue as part of this work rather than accepting a 5x memory bump.

## The actual prize: a real rate limiter

Worth being clear about why this is worth doing at all.

There is currently **no client-side rate limiting anywhere**.
`src/api_calls/request.ts` only reacts to a 429 after the fact with backoff. The
API budgets per IP — data 2000/hr, action 5000/hr, account 300/hr — and all five
containers draw from that one pool while being structurally unable to see each
other. Each process behaves as though it owns the entire budget.

That is the root of both August 429 episodes and the current one. The individual
livelocks are the trigger, but the reason a single stuck character can starve the
whole fleet is that nothing is metering the shared resource.

One process is the only place a proper token bucket for the three buckets can
live. That, not tidiness, is the argument.

## Task list

Roughly in dependency order.

**Foundation**

1. Add an `AsyncLocalStorage` character context module.
2. Rewrite the winston formats and `defaultMeta` to read the store, falling back
   to the env var so single-character runs still work.
3. Move the metric labels at `request.ts:177` and `Actions.ts:295,301` onto the
   store.
4. Audit for context loss across timers, emitters and the raid polling loops.

**Config and construction** 5. Make `role` a `Character` constructor argument; delete `CharRole`. 6. Replace `CHARACTER_NAME` / `ROLE` env vars with a name-to-role config map. 7. Rework `main.ts` to construct N characters, wrapping each
`executeJobList()` in `als.run` plus catch-and-restart. 8. Replace the two `process.exit` calls with per-character failure handling.

**HTTP** 9. Namespace the fourteen routers under `/char/:name`. 10. Replace `requestLoadout`'s HTTP hop with a direct call; delete the three dead
RPCs in `Account.ts`.

**Caches** 11. Raise `FIGHT_SIMULATION_CACHE_LIMIT`. 12. Hoist the per-instance item maps to a shared catalogue. 13. Review `BankCache` hand-out for the tighter concurrent-planning race.

**Logging and deployment** 14. Per-character winston transport keyed off the store, preserving the current
directory layout. 15. Single-service `docker-compose.yml`; drop the per-character services. 16. Collapse the Prometheus scrape config to one target.

**The actual payoff** 17. Add a shared token bucket for the data, action and account buckets in
`request.ts`.

## Is it worth it

Yes, but for one reason, and with one caveat.

The reason is item 17. Everything above it is the cost of admission for being
able to meter the shared budget in one place. If the rate limiting were already
solved, this refactor would be tidiness and would not pay for itself.

The caveat: **this does not fix the livelocks.** A stuck character in a shared
process still spins — it just spins more cheaply and stops taking the other four
down with it. The reroll gate and the retry multiplication are separate work and
should probably come first, because they are much smaller and address the actual
triggers.

There is also a cheaper middle option worth weighing: keep the five containers
and put the token bucket in Postgres or Redis as a shared counter. That gets the
main win, keeps the crash isolation and the per-character logs, and skips items
1-16 entirely. It is meaningfully less elegant and adds a round trip to every
API call, but it is a fraction of the work.
