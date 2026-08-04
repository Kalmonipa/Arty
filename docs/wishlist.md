# wishlist table

## Purpose

This table is where characters can put up items that they need, and check what other characters need.
If able to fulfil the request they will. For example a character needs a voidstone pickaxe so puts it up in the wishlist. When
the gemstone_merchant event starts, that character will see their need for a voidstone pickaxe and attempt to buy one, provided
there is enough gold.
They'll also check what other characters want. For example, the weaponcrafter may check if any characters need a weapon, and craft
1 if they are high enough level, placing it in the bank after doing so.

## Schema

```sql
CREATE TABLE wishlist (
    id SERIAL PRIMARY KEY,
    item_code TEXT NOT NULL,
    quantity INT NOT NULL,
    character TEXT NOT NULL,
    executing BOOLEAN,
    fulfilled BOOLEAN,
    executing_by TEXT,
    acquisition_method TEXT,
    min_level INT,
    max_level INT,
    cost INT,
    currency TEXT,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expiration_date TIMESTAMPTZ,
    job_id TEXT,

    -- Safety check: Ensure min_level is never greater than max_level
    CONSTRAINT chk_level_range CHECK (min_level <= max_level)
);
```

Adding `job_id` to an existing table:

```sql
ALTER TABLE wishlist ADD COLUMN job_id TEXT;
```

## Columns

| Column               | Type          | Notes                                                                                                                       |
| -------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `item_code`          | `TEXT`        | Item code of the item being requested                                                                                       |
| `quantity`           | `INTEGER`     | How many are being requested                                                                                                |
| `character`          | `TEXT`        | Character requesting the item                                                                                               |
| `min_level`          | `INT`         | Min level needed to acquire                                                                                                 |
| `max_level`          | `INT`         | Max level needed to acquire                                                                                                 |
| `expiration_date`    | `TIMESTAMPTZ` | When the request should be removed from the table. Defaults to 7 days after creation (applied in the insert via `COALESCE`) |
| `cost`               | `INT`         | Cost to acquire (gold required?)                                                                                            |
| `currency`           | `TEXT`        | The currency needed to acquire it                                                                                           |
| `acquisition_method` | `TEXT`        | One of: buy, mining, fishing, woodcutting, gearcrafting, weaponcrafting, jewellrycrafting, tasks                            |
| `executing`          | `BOOLEAN`     | True if a character has picked up the request                                                                               |
| `executing_by`       | `TEXT`        | The character holding the claim. NULL when the request is open                                                              |
| `claimed_at`         | `TIMESTAMPTZ` | When the claim was taken. NULL when the request is open                                                                     |
| `fulfilled`          | `BOOLEAN`     | True if a character has completed the request                                                                               |
| `created_at`         | `TIMESTAMPTZ` | When the request was made. Defaults to now                                                                                  |
| `job_id`             | `TEXT`        | ID of the job that this request stems from. NULL when nothing is waiting on it                                              |

## Who a request belongs to

`job_id` is the objectiveId of the job that can't continue without the item, and
it decides what happens to the row:

- **Set** — the job is parked (onHold) until the row is fulfilled. A row is that
  job's blocking token, so it belongs to exactly one job: two jobs each needing
  25 steel bars need a row each, or one delivery of 25 resumes both and leaves the
  second short. Cleaning up after a job is `DELETE ... WHERE job_id = $1`, with no
  need to check whether anything else still wants the row.
- **NULL** — nothing is waiting on it. A character wishing for better gear posts
  these: it equips the best it can lay hands on and carries on working, and the
  request sits there until someone crafts one or it expires.

Both cases are deduped before inserting, scoped to the same `character`: within a
job for owned rows, across the whole run for unowned ones. The check counts a
claimed (`executing`) row as still open, because the item is on its way.

Because the column is what associates a request with a job, there's no in-process
record of "requests I'm waiting on" to be lost on restart or to drift from the
rows that actually exist.

## Claiming a request

Every character runs in its own process against this shared table, so a request
is claimed with a single conditional update rather than a read followed by a
write:

```sql
UPDATE wishlist
SET executing = true, executing_by = $2, claimed_at = NOW()
WHERE id = $1 AND executing = false AND fulfilled = false
RETURNING id;
```

If no row comes back, another character got there first and the fulfiller stops
before doing any work. The rows read at the start of an idle cycle can be
minutes or hours stale by the time they're worked, so this update — not the
earlier `SELECT` — is what decides ownership. Releasing a request (fulfilled or
failed) is scoped to `executing_by` for the same reason.

On startup a process releases only the claims it owns; releasing every executing
row would pull requests out from under the other characters mid-fulfilment. A
claim untouched for 24 hours can be released by any process, as a backstop for a
character that never comes back.
