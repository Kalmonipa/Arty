# `acquisition_limits` table

The cap rules for limited-purchase items. One row per category. Consulted by the
"can I buy this?" check against the [`acquisitions`](./acquisitions.md) ledger.

## Purpose

Keeps the _policy_ (how many of each item the team may own) out of code and in data,
so a new capped category is added with a single `INSERT` rather than a code change.

Two cap dimensions are supported:

- **`max_per_item`** — total allowed across the whole team, per `item_code`.
- **`max_per_character_per_item`** — optional per-character limit, per `item_code`.
  `NULL` means no per-character limit.

## Schema

```sql
CREATE TABLE acquisition_limits (
  category                   TEXT PRIMARY KEY,
  max_per_item               INT NOT NULL,   -- total across the team, per item_code
  max_per_character_per_item INT             -- NULL = no per-character limit
);
```

## Seed data

```sql
INSERT INTO acquisition_limits (category, max_per_item, max_per_character_per_item) VALUES
  ('voidstone_tool', 1, NULL),  -- one of each tool, total
  ('artifact',       5, 1),     -- five of each, but only one per character
  ('rune',           3, NULL);  -- three of each, total
```

## Columns

| Column                       | Type             | Notes                                                                |
| ---------------------------- | ---------------- | -------------------------------------------------------------------- |
| `category`                   | `TEXT`           | Primary key. Matches `acquisitions.category`.                        |
| `max_per_item`               | `INT`            | Team-wide cap per `item_code`.                                       |
| `max_per_character_per_item` | `INT` (nullable) | Per-character cap per `item_code`; `NULL` = unlimited per character. |

## How the caps combine

For artifacts, `max_per_item = 5` and `max_per_character_per_item = 1`. Since the
team has exactly five characters, the per-character limit of 1 already guarantees no
more than five exist — the unique index `(item_code, character)` on `acquisitions`
enforces both at the database level. The `max_per_item` value documents the intent
and stays correct even if the roster size changes.

## Adding a new capped category

1. `INSERT` a row here with the desired caps.
2. If the new category needs database-level race protection, add a matching partial
   unique index on `acquisitions` (see that table's doc). Otherwise the
   transactional count-check is sufficient.

No new table or query is needed — the generic check in
[`acquisitions`](./acquisitions.md) already handles any category.

## Season reset

This table holds curated config, not gameplay state. The `db:reset` script
re-seeds it from the values above; the schema is stable across seasons.

## Related

- [`acquisitions`](./acquisitions.md) — the ledger these caps are checked against.
