import { db } from '../db.js';
import { logger } from '../utils.js';
import { AcquisitionMethod, WishlistRequest, WishlistRow } from './types.js';

/**
 * Adds an item to the wishlist with the specified info
 * @param wishlistInfo The information for the request so other characters can understand what's required
 * @returns true if the request was saved, false otherwise
 */
export async function addToWishlist(
  wishlistInfo: WishlistRequest,
): Promise<boolean> {
  const query = `
    INSERT INTO wishlist (
      item_code, quantity, character,
      min_level, max_level, expiration_date,
      cost, currency, acquisition_method,
      executing, fulfilled
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, false);
  `;

  try {
    await db.query(query, [
      wishlistInfo.itemCode,
      wishlistInfo.quantity,
      wishlistInfo.characterName,
      wishlistInfo.minLevel ?? null,
      wishlistInfo.maxLevel ?? null,
      wishlistInfo.expirationDate ?? null,
      wishlistInfo.cost ?? null,
      wishlistInfo.currency ?? null,
      wishlistInfo.acquisitionMethod ?? null,
    ]);
    return true;
  } catch (err) {
    logger.error(`Failed to add ${wishlistInfo.itemCode} to wishlist: ${err}`);
    return false;
  }
}

/**
 * Finds open wishlist requests for a given acquisition method — i.e. requests
 * that no character has picked up (executing) or completed (fulfilled) yet.
 * Ordered oldest-first so requests are worked as a FIFO queue.
 * @param acquisitionMethod One of: buy, mining, fishing, woodcutting, gearcrafting, weaponcrafting, jewellrycrafting, tasks
 * @returns matching rows, or an empty array on error
 */
export async function getOpenWishlistRequests(
  acquisitionMethod: AcquisitionMethod,
): Promise<WishlistRow[]> {
  const query = `
    SELECT id, item_code, quantity, character,
           min_level, max_level, expiration_date,
           cost, currency, acquisition_method,
           executing, fulfilled, created_at
    FROM wishlist
    WHERE acquisition_method = $1
      AND executing = false
      AND fulfilled = false
    ORDER BY created_at ASC;
  `;

  try {
    const result = await db.query<WishlistRow>(query, [acquisitionMethod]);
    return result.rows;
  } catch (err) {
    logger.error(
      `Failed to fetch wishlist requests for ${acquisitionMethod}: ${err}`,
    );
    return [];
  }
}
