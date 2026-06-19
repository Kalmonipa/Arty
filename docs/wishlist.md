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
    character TEXT NOT NULL,
    min_level INT,
    max_level INT,
    expiration_date TIMESTAMPTZ,
    cost INT,
    acquisition_method TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Safety check: Ensure min_level is never greater than max_level
    CONSTRAINT chk_level_range CHECK (min_level <= max_level)
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
