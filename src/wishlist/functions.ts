import { getItemInformation } from '../api_calls/Items.js';
import { ApiError } from '../core/Error.js';
import { db } from '../db.js';
import { ItemSchema } from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { AcquisitionMethod, WishlistRequest, WishlistRow } from './types.js';

/**
 * Works out how an item is acquired from its own data. Acquisition method is an
 * intrinsic property of the item, not a per-request choice, so it's derived once
 * here and stored on the request for cheap fulfiller-side filtering.
 */
export function deriveAcquisitionMethod(item: ItemSchema): AcquisitionMethod {
  // Crafted items (bars, gear, weapons, food, potions): the craft skill is how
  // you make it. Takes priority — e.g. a copper bar has subtype "bar" but is
  // made with the mining skill.
  if (item.craft?.skill) {
    return item.craft.skill;
  }

  // Raw resources gathered with a skill carry that skill as their subtype.
  if (isGatheringSkill(item.subtype)) {
    return item.subtype;
  }

  if (item.subtype === 'mob') {
    return 'fight';
  }
  if (item.subtype === 'task') {
    return 'tasks';
  }

  // Everything else is bought from an NPC.
  return 'buy';
}

/**
 * The skill/character level needed to acquire an item: the craft level for
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
 */
export async function addToWishlist(
  wishlistInfo: WishlistRequest,
): Promise<boolean> {
  let acquisitionMethod: string | null =
    wishlistInfo.acquisitionMethod ?? null;
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
