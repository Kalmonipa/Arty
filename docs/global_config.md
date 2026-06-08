# `global_config` table

Existing key/value store for miscellaneous team-wide settings. Already used in code
(`src/db.ts` `GlobalConfig`, `src/core/CharacterConfig.ts`).

## Purpose

A simple, schemaless place for one-off settings that are shared across characters and
don't justify their own table. The `value` column holds arbitrary JSON, so a setting
can be a string, number, array or object.

Use this for loose, low-structure config. For anything relational or queryable —
capped purchases, event policy — use a dedicated table
([`acquisitions`](./acquisitions.md), [`event_rules`](./event_rules.md)) instead of
stuffing it into a JSON blob here.

## Schema

```sql
CREATE TABLE global_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Columns

| Column | Type | Notes |
| --- | --- | --- |
| `key` | `TEXT` | Primary key, e.g. `ignore_event_list`. |
| `value` | `JSONB` | Arbitrary JSON payload for the setting. |
| `updated_at` | `TIMESTAMPTZ` | Last write time. |

## Reading a value

```sql
SELECT value FROM global_config WHERE key = $1;
```

`CharacterConfig.ts` wraps this — e.g. `getIgnoreEventList()` reads the
`ignore_event_list` key and returns `value` as a `string[]`.

## Migration note: `ignore_event_list` → `event_rules`

The `ignore_event_list` key is superseded by the [`event_rules`](./event_rules.md)
table, which supports per-character ignores and level/skill windows that a flat array
cannot. Once `checkForActiveEvents()` reads from `event_rules`, the
`ignore_event_list` key (and `getIgnoreEventList()`) can be removed.

## Season reset

Handled by the `db:reset` script. Keys that are pure config are re-seeded; any keys
that cache gameplay state are cleared. Schema is stable across seasons.

## Related

- [`event_rules`](./event_rules.md) — replaces the `ignore_event_list` key.
- [`acquisitions`](./acquisitions.md) / [`acquisition_limits`](./acquisition_limits.md)
  — capped-purchase tracking that belongs in dedicated tables, not here.
