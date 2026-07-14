import { getItemInformation } from '../api_calls/Items.js';
import { ApiError } from '../core/Error.js';
import { db } from '../db.js';
import { ItemSchema } from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { AcquisitionMethod, WishlistRequest, WishlistRow } from './types.js';

/**
 * @description Works out the acquisition method based on the requested item info
 */
export function deriveAcquisitionMethod(item: ItemSchema): AcquisitionMethod {
  if (item.craft?.skill) {
    return item.craft.skill;
  }

  if (isGatheringSkill(item.subtype)) {
    return item.subtype;
  }

  if (item.subtype === 'mob') {
    return 'fight';
  }
  if (item.subtype === 'task') {
    return 'tasks';
  }

  // Might be missing some edge cases here
  return 'buy';
}

/**
 * @description The skill/character level needed to acquire an item: the craft level for
 * crafted items, otherwise the item's own level.
 */
export function deriveRequiredLevel(item: ItemSchema): number {
  return item.craft?.level ?? item.level;
}

/**
 * Adds an item to the wishlist. The acquisition method and required level are
 * derived from the item's data so fulfillers can filter reliably; a caller may
 * still override them explicitly (e.g. to force "buy" for a craftable item).
 * @param wishlistInfo The information for the request so other characters can understand what's required
 * @returns true if the request was saved, false otherwise
 * @todo Check if there's already a request in the wishlist for this item from this char
 */
export async function addToWishlist(
  wishlistInfo: WishlistRequest,
): Promise<boolean> {
  let acquisitionMethod: string | null = wishlistInfo.acquisitionMethod ?? null;
  let minLevel: number | null = wishlistInfo.minLevel ?? null;

  const item = await getItemInformation(wishlistInfo.itemCode);
  if (item instanceof ApiError) {
    logger.warn(
      `Could not load ${wishlistInfo.itemCode} to derive wishlist details: ${item.message}`,
    );
  } else {
    acquisitionMethod =
      wishlistInfo.acquisitionMethod ?? deriveAcquisitionMethod(item);
    minLevel = wishlistInfo.minLevel ?? deriveRequiredLevel(item);
  }

  const query = `
    INSERT INTO wishlist (
      item_code, quantity, character,
      min_level, max_level, expiration_date,
      cost, currency, acquisition_method,
      executing, fulfilled
    )
    VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW() + INTERVAL '7 days'), $7, $8, $9, false, false);
  `;

  try {
    await db.query(query, [
      wishlistInfo.itemCode,
      wishlistInfo.quantity,
      wishlistInfo.characterName,
      minLevel,
      wishlistInfo.maxLevel ?? null,
      wishlistInfo.expirationDate ?? null,
      wishlistInfo.cost ?? null,
      wishlistInfo.currency ?? null,
      acquisitionMethod,
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
 * @param acquisitionMethod One of: buy, tasks, fight, mining, fishing, woodcutting, alchemy, cooking, gearcrafting, weaponcrafting, jewelrycrafting
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

/**
 * Marks a wishlist request as executing so other characters skip it while it's
 * being worked on.
 * @param id The wishlist row id
 * @returns true if a row was updated, false otherwise
 */
export async function markAsExecuting(id: number): Promise<boolean> {
  logger.debug(`Marking request ${id} as executing`);
  const query = `UPDATE wishlist SET executing = true WHERE id = $1;`;

  try {
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error(`Failed to mark wishlist request ${id} as executing: ${err}`);
    return false;
  }
}

/**
 * Marks a wishlist request as fulfilled and clears its executing flag so its
 * row is left in a clean, final state.
 * @param id The wishlist row id
 * @returns true if a row was updated, false otherwise
 */
export async function markAsFulfilled(id: number): Promise<boolean> {
  logger.debug(`Marking request ${id} as fulfilled`);
  const query = `UPDATE wishlist SET fulfilled = true, executing = false WHERE id = $1;`;

  try {
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error(`Failed to mark wishlist request ${id} as fulfilled: ${err}`);
    return false;
  }
}

/**
 * Deletes a wishlist request outright.
 * @param id The wishlist row id
 * @returns true if a row was deleted, false otherwise
 */
export async function deleteWishlistRequest(id: number): Promise<boolean> {
  logger.debug(`Deleting request ${id} from wishlist`);

  const query = `DELETE FROM wishlist WHERE id = $1;`;

  try {
    const result = await db.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error(`Failed to delete wishlist request ${id}: ${err}`);
    return false;
  }
}
