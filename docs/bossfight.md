# Boss fights

Multi-character boss fights, built up in independently shippable steps.

## Architecture summary

Three characters must be on the same map, and one of them (the leader) calls
`POST /my/{name}/action/fight` with `participants: [a, b]`. There is no party API — the
game server validates that everyone is present, so **the game is the final arbiter** of
whether a fight is legal.

Two consequences shape the whole design:

1. **Readiness is mostly observable.** `GET /my/characters` returns position, HP, every
   gear slot, utility quantities and `cooldown_expiration` for all five characters in one
   call. The leader does not need to be *told* the happy path.
2. **Failure is not observable.** "Still walking there" and "gave up, no restore potions"
   look identical from outside. That is the only thing that genuinely needs a channel.

Coordination therefore lives in Postgres (matching the `wishlist/` pattern), which also
gives durability for the eventual automated path and one place for the CLI to query.
Each process only ever writes its own participant row, so there are no races and no
locking.

Interruption reuses the existing on-hold queue (`parkJob` / `resumeOnHoldJob`,
`characterClass.ts:1049-1094`) — the machinery already built for wishlist blocking. Boss
fights just need it triggered *externally* rather than by a job discovering it's blocked.

### Division of labour

- **Leader** plans (proposes and reconciles loadouts, sims, decides), writes the fight
  record, fires the fight action, and invalidates readiness after each fight.
- **Participants** equip exactly what they're told, park themselves on the boss tile,
  assert their own readiness, and self-evaluate between fights.

The leader plans rather than each character planning for itself, because three characters
planning independently against one bank will each claim the same best-in-slot item — the
`allocated` map that prevents double-claiming is created fresh inside `chooseCombatGear`
(`EvaluateGearObjective.ts:343`) and is scoped to a single character.

---

## Step 0 — Fix the dead paths

Three latent bugs sit directly on the road. None have ever run.

- [ ] `src/api_calls/Account.ts:18` — `charName.toLowerCase` is missing its call parens, so
      the URL interpolates the function source: `http://function toLowerCase() { [native
      code] }:3000/jobs/pause`. `fetch` throws, the `catch` at :24 returns the error as if
      it were a `JobResponse`, and both call sites ignore the return value. Add `()`.
      The `http://<name>:3000` scheme itself is correct — containers are named after the
      lowercased character.
- [ ] `src/api_calls/Actions.ts:97` — `body: participants` sends a bare array, but the
      endpoint expects `FightRequestSchema` (`types.ts:1415-1421`), i.e.
      `{ participants: [...] }`. As written a group fight would 422.
- [ ] `src/character/characterClass.ts:3355` — `simulateFightNow` returns
      `executeJobNow`'s boolean, discarding `FightSimulator.winRate`
      (`FightSimulator.ts:20,63`). Step 2 and Step 7 both need the actual rate to decide
      "is a two-character fight good enough". Return the win rate or the job.

**Verify:** `curl -X POST http://localhost:8063/jobs/pause` still works from the host, and
a leader container can reach `http://timidtom:3000/jobs/pause` on the docker network.

---

## Step 1 — Loadout proposal endpoint

Expose what already exists so the leader can ask others what they'd wear.

- [ ] `GET /equip/propose-loadout?mob=<code>` in `src/routes/Equip.ts`, wrapping
      `Character.proposeCombatLoadout` (`characterClass.ts:3118`). Returns the
      `FakeCharacterSchema` unchanged. No equipping, no movement.
- [ ] Add an `Account.ts` helper to call it on another character.

**Verify:** curl each of the five characters for `king_slime` and eyeball the loadouts.
Check that a character holding a gathering weapon proposes a *combat* weapon — that is the
bug in the leader stub's private `createFakeCharacterSchema`
(`FightBossLeaderObjective.ts:146`), which substitutes the leader's own weapon into every
participant's schema.

**Why first:** zero risk, no coordination, and it de-risks the domain logic everything else
depends on.

---

## Step 2 — Feasibility check (no movement)

A standalone, genuinely useful command: *could* we beat this boss? Nothing moves.

- [ ] `src/bossFight/feasibility.ts` — given a leader, a boss and two support names:
      collect three proposals, reconcile contention, sim, return verdict + win rate.
- [ ] **Reconciliation:** where two proposals name the same item code and the bank holds
      fewer than the number claimed, strip it from the lower-priority character and ask
      that one to re-propose without it. Priority: leader > first support > second support.
      Pass an exclusion list to the re-propose call.
- [ ] Delete the private `createFakeCharacterSchema`
      (`FightBossLeaderObjective.ts:140-170`) — `Character.createFakeCharacterSchema`
      (`characterClass.ts:1659`) already exists and is correct.
- [ ] Delete `findBestParticipants` (`FightBossLeaderObjective.ts:104-135`). Its
      comparison logic is broken: `part1`/`part2` are seeded from whichever character comes
      first, the `else if` lets `part2` end up higher-level than `part1`, and the leader is
      in its own candidate pool. Replace with `findSupportCharacters()` — filter
      `getMyCharacters()` for `role === 'labourer'`, take two.
- [ ] `POST /fight/boss/check` + `arty <leader> bossfight-check <boss>` in the CLI.

**Verify:** `arty larry bossfight-check king_slime` prints the three loadouts, any
reconciliation it did, and a win rate. Nothing has moved and nothing is equipped.

**Why here:** if the sim says three characters can never win, the rest of the feature is
moot. Find that out before building coordination.

---

## Step 3 — Yield-and-park primitive

The one change that reaches outside boss-fight code. Highest risk, so ship it alone and
test it in isolation.

Note `pauseJob()` is *not* this: it sets the current objective to `paused` and
`checkStatus` spins in `while (status === 'paused') await sleep(10)`
(`Objective.ts:328`), which freezes the job in place. Control never returns to
`executeJobList`, so a prepended job would never run.

- [ ] `Character.yieldRequested: string | null` — holds a reason, e.g. `boss_fight:12`.
- [ ] `Objective.checkStatus()` — if set **and this is not the boss objective itself**, set
      `this.yielded = true` and return false. Guard against the boss objective yielding
      itself into an infinite park loop.
- [ ] `Objective.execute()` — sibling branch to the wishlist park at `Objective.ts:110`:
      if `this.yielded`, `parkJob(this)` and return false instead of completing.
- [ ] `OnHoldJob` (`types/ObjectiveData.ts:41-46`) gains `reason: 'wishlist' | 'yield'`.
- [ ] `checkOnHoldQueue` (`idleUtils.ts:66`) must **skip** `reason: 'yield'` entries. With
      an empty `waitingOn`, its check at :74-75 evaluates `0 === 0 && [].every(...)` →
      `true`, so it would resume the parked job on the next idle pass, mid-fight.
- [ ] Only root jobs park; the existing `parkOnWishlistRequest` opt-in already identifies
      them. Children just unwind.
- [ ] `POST /jobs/yield` and `POST /jobs/unyield` routes, so this is testable by hand.
- [ ] **Stuck-flag guard:** if `yieldRequested` is set but the fight it names is terminal,
      expired, or absent, clear it. Check on startup and in the idle loop. Without this, a
      crash between setting the flag and enqueueing the boss job leaves a character
      yielding every job forever.

**Verify:** `POST /jobs/yield` at Tom mid-fishing. His job should park (not fail), appear
in `GET /jobs/list/with-parents` under `onHold`, and survive a container restart via
`saveJobQueue`. Then `POST /jobs/unyield` and confirm it resumes from its saved `progress`
rather than restarting.

---

## Step 4 — Fight record

Mechanical. No behaviour change.

- [ ] Migration:

```sql
CREATE TABLE boss_fights (
  id           SERIAL PRIMARY KEY,
  boss_code    TEXT NOT NULL,
  leader       TEXT NOT NULL,
  quantity     INT  NOT NULL DEFAULT 1,
  state        TEXT NOT NULL,           -- preparing | fighting | done | aborted
  fights_done  INT  NOT NULL DEFAULT 0,
  abort_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE boss_fight_participants (
  fight_id       INT  NOT NULL REFERENCES boss_fights(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  role           TEXT NOT NULL,         -- leader | participant
  state          TEXT NOT NULL,         -- assigned | preparing | ready | failed | released
  reason         TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (fight_id, character_name)
);
```

- [ ] `src/bossFight/functions.ts` — create fight, set own participant state, read fight
      with participants, terminal transitions. Mirror `wishlist/functions.ts`.
- [ ] `src/bossFight/types.ts`, `src/bossFight/routes.ts` (`GET /bossfight`,
      `GET /bossfight/:id`), registered in `main.ts`.
- [ ] Guard: refuse to create a fight if any named character already has a non-terminal
      row.

**Verify:** create a fight by hand via the route, read it back, confirm the cascade delete.

---

## Step 5 — Explicit-loadout equip

Participants equip what they're told, not what they independently decide. Removes the
divergence between what was simmed and what gets worn.

- [ ] `POST /equip/loadout` taking `{ items: [{ code, slot }] }`, equipping each via
      `equipNow`. Reports per-slot success.
- [ ] Food and restore potions handled in the same call (utility slots), reusing
      `equipUtility('restore', 'utility1')`.

**Verify:** send Tom an explicit loadout and confirm he wears exactly it, including the
utility quantities.

---

## Step 6 — Single fight, happy path only

Wire it together for `quantity = 1`. No timeouts, no failure handling — crash out and fix
by hand. The point is to see one real fight happen.

- [ ] Rewrite `FightBossLeaderObjective.run()`: feasibility check (Step 2) → create record
      → set `yieldRequested` and enqueue participant jobs on the two supports → prep self →
      mark own row `ready` → poll until all three rows `ready` → fire → mark `done` →
      release.
- [ ] Rewrite `FightBossParticipantObjective`: equip the given loadout → move to boss map →
      mark row `ready` → poll own fight row → exit on terminal state → parked job resumes.
- [ ] **Participants must never call the fight action.** The current stub loops over
      `target.quantity` (`FightBossParticipantObjecive.ts:56-74`) as though it fights
      independently, and imports `actionFight` without using it. Only the leader fights.
- [ ] `POST /fight/boss/lead` and `arty <leader> bossfight <boss> <p1> <p2>`.

**Verify:** `arty larry bossfight king_slime jumpyjimmy bouncybella`. All three converge on
the tile, one fight resolves, all three unpark and resume their previous jobs from saved
progress.

---

## Step 7 — Timeouts and failure

- [ ] Ready timeout (~5 min, configurable). Yield latency is real: a participant mid-gather
      only notices at its next `checkStatus()` checkpoint.
- [ ] A `failed` participant row short-circuits the wait — no point waiting on someone who
      has given up.
- [ ] On timeout or failure: re-sim with the participants that *are* ready. Proceed with two
      if the win rate clears the threshold, else abort with a reason. Needs the win rate
      from Step 0.
- [ ] `expires_at` (~30 min) as the crash backstop. Participants exit their wait loop when
      it passes even if the leader's container is gone. Without this a leader crash strands
      two characters on a boss tile indefinitely.
- [ ] Participants mark `failed` with a reason when prep can't complete — no gear, no
      restore potions in the bank, boss map unreachable.

**Verify:** kill the leader container mid-wait and confirm both participants release
themselves and resume. Separately, hide all restore potions from the bank and confirm the
leader either drops to a two-character fight or aborts cleanly.

---

## Step 8 — Multi-fight sequences

- [ ] Leader invalidates readiness atomically after each fight — it is the only process
      that knows a fight happened:

```sql
BEGIN;
  UPDATE boss_fights SET fights_done = fights_done + 1 WHERE id = $1;
  UPDATE boss_fight_participants SET state = 'preparing' WHERE fight_id = $1;
COMMIT;
```

      Without this there is a stale-ready window: the leader polls before participants have
      noticed and cleared, sees three `ready` rows, and fires into a hurt, off-tile party.

- [ ] Participants react to their row going `preparing`: recover HP, top up utilities, walk
      back if the bank trip moved them, then set their own row `ready`.
- [ ] Leader waits for `max(cooldown_expiration)` across the three before the next fight.
- [ ] When `fights_done` reaches `quantity`: state `done`, everyone unparks.
- [ ] **Inventory pressure.** Boss drops accumulate across a sequence. Decide whether the
      leader deposits between fights (costs a round trip and re-readying) or the sequence
      is capped at what inventory holds. `actionFight` already surfaces 497 for a full
      inventory.

**Verify:** a three-fight sequence where a participant is forced to the bank for potions
mid-sequence. The leader must not fire while they're away.

---

## Step 9 — CLI polish

- [ ] `arty bossfight status` — reads the record directly, one call instead of fanning out
      across three servers.
- [ ] `arty bossfight abort <id>` — sets the record terminal; participants release
      themselves on their next poll.

---

## Step 10 — Automated trigger

Deferred until the manual path is solid.

- [ ] Only the crafter initiates, so it is always the leader. No leader election needed.
- [ ] Support characters are the two labourers (`findSupportCharacters()` from Step 2).
- [ ] Idle-loop hook: run the Step 2 feasibility check periodically; if the win rate clears
      the threshold and no fight is in flight, start one.
- [ ] The `proposed` state seam: if you ever want any character to initiate, claiming
      leadership becomes `UPDATE ... WHERE state = 'proposed'`. Don't build it now.

---

## Deferred decisions

- **Sharing gear allocation properly.** Reconciliation (Step 2) fixes contention leader-side
  without touching gear selection. The cleaner fix is parameterising `chooseCombatGear` by
  character data so the leader plans all three against one shared `allocated` map. Real
  refactor of `EvaluateGearObjective`; same correctness. Revisit only if reconciliation
  proves fiddly.
- **Raid bosses.** The docs mention a separate raid reward system. Out of scope.
- **`pauseCharacter` / `resumeCharacter`.** Not the right primitive for pre-emption (see
  Step 3) but still useful as manual CLI controls. Leave them.
