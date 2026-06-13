# `event_rules` table

Per-event participation policy: level/skill windows, per-character overrides and
hard ignores. Replaces the hardcoded `if/else` ladder in
`Character.checkForActiveEvents()`.

## Purpose

Decide whether a given character should attempt a given active event. Today this is
a long hardcoded ladder (`bandit_camp` needs level 25–35, `portal_demon` 30–40, …)
plus an unused `ignoredEvents` array. This table moves that curated policy into data
so it can be edited — and configured per character via the API — without a code
change or redeploy.

## Default behaviour

**Participate by default.** An event with no matching row is attempted by everyone
(subject to the in-code merchant rules below). Rows only _add restrictions_, so you
only write rows for events you want to gate or ignore.

## Schema

```sql
CREATE TABLE event_rules (
  id          SERIAL PRIMARY KEY,
  event_code  TEXT NOT NULL,
  character   TEXT,              -- NULL = applies to all characters
  skill       TEXT,             -- NULL = combat level; else 'mining','woodcutting',...
  min_level   INT,             -- NULL = no lower bound
  max_level   INT,             -- NULL = no upper bound
  ignore      BOOLEAN NOT NULL DEFAULT false,  -- hard ignore, regardless of level
  UNIQUE (event_code, character)
);
```

## Columns

| Column       | Type              | Notes                                                                                                          |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`         | `SERIAL`          | Primary key.                                                                                                   |
| `event_code` | `TEXT`            | The event, e.g. `bandit_camp`.                                                                                 |
| `character`  | `TEXT` (nullable) | `NULL` = team-wide rule; a name = rule for that character only.                                                |
| `skill`      | `TEXT` (nullable) | `NULL` = window compares against combat level; otherwise the named skill's level (`mining`, `woodcutting`, …). |
| `min_level`  | `INT` (nullable)  | Lower bound, inclusive. `NULL` = no lower bound.                                                               |
| `max_level`  | `INT` (nullable)  | Upper bound, inclusive. `NULL` = no upper bound.                                                               |
| `ignore`     | `BOOLEAN`         | `true` = skip entirely, ignoring the level window.                                                             |

The `UNIQUE (event_code, character)` constraint means each character has at most one
row per event (and the team-wide rule is the single `character IS NULL` row). It also
makes the API upserts idempotent.

## Precedence

When evaluating an event for a character, the **most specific matching row wins**:

1. A row matching `(event_code, this character)` takes priority.
2. Otherwise the team-wide row `(event_code, NULL)` applies.
3. Otherwise no rule → participate.

The match is **whole-row override**: a character-specific row replaces the team-wide
row entirely (its fields are not merged with the team-wide row's).

## Eligibility check

For an active event and a character:

1. Find the most specific matching row (per precedence above). None → **participate**.
2. If `ignore = true` → **skip**.
3. Read the character's level: combat level when `skill IS NULL`, otherwise the named
   skill's level (the game `CharacterSchema` exposes `mining_level`,
   `woodcutting_level`, etc.).
4. Skip if that level is `< min_level` or `> max_level`; otherwise **participate**.

## Seed data

The current hardcoded windows, migrated verbatim (all combat-level except the two
apparitions):

```sql
INSERT INTO event_rules (event_code, skill, min_level, max_level) VALUES
  ('bandit_camp',           NULL,         25, 35),
  ('portal_demon',          NULL,         30, 40),
  ('corrupted_ogre',        NULL,         30, NULL),
  ('corrupted_owlbear',     NULL,         30, NULL),
  ('cult_of_darkness',      NULL,         40, NULL),
  ('portal_efreet_sultan',  NULL,         42, NULL),
  ('corrupted_portal',      NULL,         45, NULL),
  ('attacking_the_island',  NULL,         45, NULL),
  ('strange_apparition',    'mining',     35, NULL),
  ('magic_apparition',      'woodcutting',35, NULL);
```

## Per-character ignores

"Multiple characters ignore an event" is modelled as **multiple rows**, one per
character — not a list inside one row. To make Tom and Bella ignore `bandit_camp`
while the team-wide window still applies to everyone else:

```sql
-- team-wide window (from seed data)
(bandit_camp, NULL,        skill=NULL, min=25, max=35, ignore=false)
-- per-character opt-outs
(bandit_camp, TimidTom,    ignore=true)
(bandit_camp, BouncyBella, ignore=true)
```

"Who is ignoring an event?":

```sql
SELECT character FROM event_rules WHERE event_code = $code AND ignore = true;
```

## API endpoints (Arty app)

| Endpoint                                    | Action                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /events/:code/ignore` `{character}`   | Upsert `(code, character, ignore=true)` — adds the character to the ignore list. |
| `DELETE /events/:code/ignore` `{character}` | Delete that row — removes the character from the ignore list.                    |
| `GET /events/:code`                         | Return the team-wide rule plus the list of ignoring characters.                  |

Upserts use `ON CONFLICT (event_code, character)` so repeated calls are idempotent:

```sql
INSERT INTO event_rules (event_code, character, ignore)
VALUES ($code, $char, true)
ON CONFLICT (event_code, character) DO UPDATE SET ignore = true;
```

## Not handled here

The **FishMerchant / NomadicMerchant** rules stay in code. They gate on role plus a
24-hour cooldown rather than a level window, so they don't fit this table's shape.
Event retry **backoff** (`eventBackoffs`) is runtime state and also stays in memory.

## Season reset

Curated config — the `db:reset` script re-seeds it from the values above. Schema is
stable across seasons.

## Related

- `Character.checkForActiveEvents()` — the consumer; its level ladder collapses into
  the single eligibility check above.
