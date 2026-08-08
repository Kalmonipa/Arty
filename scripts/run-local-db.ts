import * as dotenv from 'dotenv';
import { db } from '../src/db.js';

async function createWishlistTable() {
  // We use placeholders ($1, $2, $3) to keep the query secure.
  // 'acquired_at' will default to NOW() automatically based on your schema.
  const dbQuery = `
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
        `;

  try {
    // Pass the variables safely in the parameters array
    await db.query(dbQuery);

    console.log(`Successfully created wishlist table`);
  } catch (error) {
    console.error(`Failed to create wishlist table:`, error);
    throw error;
  }
}

async function main() {
  dotenv.config();
  const dbHost = process.env.DB_HOST;

  if (!dbHost) {
    console.error('Error: DB_HOST environment variable is required');
    process.exit(1);
  }

  createWishlistTable();
}

main();
