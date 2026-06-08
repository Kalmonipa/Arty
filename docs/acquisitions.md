# `acquisitions` table

Ledger of capped, limited-purchase items owned across the team — voidstone tools,
artifacts and runes. One row = one owned unit.

## Purpose

Some items should only ever be bought a limited number of times across the whole
team (e.g. only one voidstone pickaxe in total). Before buying, a character checks
this ledger to see whether a "slot" is still available; after buying, it records the
purchase here so the other characters can see it.

This table is a **cache/ledger, not the source of truth** — the game holds the real
inventory/bank/equipment. For these big, permanent items that don't get casually
destroyed the ledger stays accurate, and it's far cheaper than rescanning every
character's inventory, the bank and equipment on each purchase decision. A
reconcile-against-game step can be added later if drift ever becomes a problem.

The cap rules themselves live in [`acquisition_limits`](./acquisition_limits.md).

## Schema

```sql
CREATE TABLE acquisitions (
  id           SERIAL PRIMARY KEY,
  category     TEXT NOT NULL,        -- 'voidstone_tool' | 'artifact' | 'rune'
  item_code    TEXT NOT NULL,        -- e.g. 'voidstone_pickaxe'
  character    TEXT NOT NULL,        -- owning character
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Race-safety: enforce caps at the database level where a unique key applies.
-- Voidstone tools: only one of each may ever exist (cap = 1 total).
CREATE UNIQUE INDEX acquisitions_voidstone_tool_uniq
  ON acquisitions (item_code)
  WHERE category = 'voidstone_tool';

-- Artifacts: at most one of each per character. With exactly 5 characters this
-- also enforces the "max 5 of each" cap automatically.
CREATE UNIQUE INDEX acquisitions_artifact_uniq
  ON acquisitions (item_code, character)
  WHERE category = 'artifact';

-- Runes have no natural unique key (cap = 3 total, no per-character limit), so the
-- cap is enforced by the count-check below, run inside a transaction.
```

## Columns

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `SERIAL` | Primary key. |
| `category` | `TEXT` | Must match a `category` in `acquisition_limits`. |
| `item_code` | `TEXT` | The specific item, e.g. `voidstone_pickaxe`, not the category. |
| `character` | `TEXT` | The character that bought/owns this unit. |
| `acquired_at` | `TIMESTAMPTZ` | When it was recorded. Defaults to now. |

## Categories and caps

| Category | Items | Cap |
| --- | --- | --- |
| `voidstone_tool` | gloves, axe, pickaxe, fishing rod | 1 of each, total |
| `artifact` | (various) | 5 of each total; 1 per character |
| `rune` | (various) | 3 of each, total |

## "Can I buy this?" check

The same query works for every category — it only needs the item code and the
buying character:

```sql
SELECT
  count(*)                                   AS total,
  count(*) FILTER (WHERE character = $char)  AS mine
FROM acquisitions
WHERE item_code = $item;
```

Allow the purchase when, for the item's category in `acquisition_limits`:

- `total < max_per_item`, **and**
- `max_per_character_per_item IS NULL` **or** `mine < max_per_character_per_item`.

### Claiming a slot safely

Because each character runs in its own process, two characters could pass the check
at the same instant. To make claims airtight:

- **Voidstone tools / artifacts** — rely on the partial unique indexes above. Just
  `INSERT`; a duplicate fails with a unique-violation, which means "already owned",
  so the character backs off without buying.
- **Runes** — wrap the count-check and `INSERT` in a single transaction so two
  concurrent claims can't both see `total < 3`.

## Recording a purchase

```sql
INSERT INTO acquisitions (category, item_code, character)
VALUES ($category, $item, $char);
```

## Season reset

Wiped on season rollover by the `db:reset` script (the game resets everything each
season). The schema is stable across seasons — no per-season tables.

## Related

- [`acquisition_limits`](./acquisition_limits.md) — the cap rules consulted above.
- [`event_rules`](./event_rules.md) — unrelated, but the other coordination table.
