import { getItemInformation } from '../api_calls/Items.js';
import { ApiError } from '../core/Error.js';
import { db } from '../db.js';
import { ItemSchema } from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import {
  AcquisitionMethod,
  WishlistRequest,
  WishlistRow,
} from './wishlist.types.js';

/** How long a claim can sit untouched before another process may reclaim it */
const STALE_CLAIM_HOURS = 24;

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
 *
 * A row belongs to at most one job (`job_id`), because it is that job's blocking
 * token: sharing a row between jobs would deliver a single quantity for all of
 * them and let the first to resume delete what the others still wait on. Callers
 * dedupe within a job via findOpenWishlistRequest rather than at insert time.
 * @param wishlistInfo The information for the request so other characters can understand what's required
 * @returns the new request's id, or null if the insert failed
 */
export async function addToWishlist(
  wishlistInfo: WishlistRequest,
): Promise<number | null> {
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

  try {
    const result = await db.query<{ id: number }>(
      `
      INSERT INTO wishlist (
        item_code, quantity, character,
        min_level, max_level, expiration_date,
        cost, currency, acquisition_method,
        job_id, executing, fulfilled
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW() + INTERVAL '7 days'), $7, $8, $9, $10, false, false)
      RETURNING id;
      `,
      [
        wishlistInfo.itemCode,
        wishlistInfo.quantity,
        wishlistInfo.characterName,
        minLevel,
        wishlistInfo.maxLevel ?? null,
        wishlistInfo.expirationDate ?? null,
        wishlistInfo.cost ?? null,
        wishlistInfo.currency ?? null,
        acquisitionMethod,
        wishlistInfo.jobId ?? null,
      ],
    );
    return result.rows[0].id;
  } catch (err) {
    logger.error(`Failed to add ${wishlistInfo.itemCode} to wishlist: ${err}`);
    return null;
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
           cost, currency, acquisition_method, job_id,
           executing, executing_by, claimed_at, fulfilled, created_at
    FROM wishlist
    WHERE acquisition_method = $1
      AND executing = false
      AND fulfilled = false
      AND (expiration_date IS NULL OR expiration_date > NOW())
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
 * Lists open wishlist requests — not yet picked up (executing) or completed
 * (fulfilled) — ordered oldest-first. With no filter, returns every open
 * request; with a character filter, only that character's own requests.
 * @param filter Optional filter; `character` limits results to one requester
 * @returns matching rows, or an empty array on error
 */
export async function listOpenWishlistRequests(filter?: {
  character?: string;
}): Promise<WishlistRow[]> {
  const conditions = [
    'executing = false',
    'fulfilled = false',
    '(expiration_date IS NULL OR expiration_date > NOW())',
  ];
  const params: string[] = [];
  if (filter?.character) {
    params.push(filter.character);
    conditions.push(`character = $${params.length}`);
  }

  const query = `
    SELECT id, item_code, quantity, character,
           min_level, max_level, expiration_date,
           cost, currency, acquisition_method, job_id,
           executing, executing_by, claimed_at, fulfilled, created_at
    FROM wishlist
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ASC;
  `;

  try {
    const result = await db.query<WishlistRow>(query, params);
    return result.rows;
  } catch (err) {
    logger.error(`Failed to list open wishlist requests: ${err}`);
    return [];
  }
}

/**
 * Claims a wishlist request for a character so the others skip it while it's
 * being worked on. Each character runs in its own process against the shared
 * table, so the claim has to be the atomic check — a row read as open earlier in
 * the cycle may have been taken since. The update only succeeds while the row is
 * still open, and the returned boolean says whether this character won it.
 *
 * Re-claiming a row this character already holds counts as winning: a fulfil job
 * runs this again when it re-enters after a child gather job, and treating that
 * as a lost race failed the job and stranded the row as executing forever, so
 * neither the holder nor anyone else could finish it.
 * @param id The wishlist row id
 * @param characterName The character claiming the request
 * @returns true if the claim was won, false if the row is taken, done or gone
 */
export async function claimWishlistRequest(
  id: number,
  characterName: string,
): Promise<boolean> {
  const query = `
    UPDATE wishlist
    SET executing = true, executing_by = $2, claimed_at = NOW()
    WHERE id = $1
      AND fulfilled = false
      AND (executing = false OR executing_by = $2)
    RETURNING id;
  `;

  try {
    const result = await db.query(query, [id, characterName]);
    const claimed = (result.rowCount ?? 0) > 0;
    if (claimed) {
      logger.info(`Claimed request #${id} for ${characterName}`);
    } else {
      logger.info(
        `Could not claim request #${id} for ${characterName}; another character got there first`,
      );
    }
    return claimed;
  } catch (err) {
    logger.error(`Failed to claim wishlist request #${id}: ${err}`);
    return false;
  }
}

/**
 * Marks a wishlist request as fulfilled and releases the claim so its row is
 * left in a clean, final state. Scoped to the claim holder so a character can't
 * close off a request another one is working on.
 * @param id The wishlist row id
 * @param characterName The character that claimed the request
 * @returns true if a row was updated, false otherwise
 */
export async function markAsFulfilled(
  id: number,
  characterName: string,
): Promise<boolean> {
  logger.debug(`Marking request #${id} as fulfilled`);
  const query = `
    UPDATE wishlist
    SET fulfilled = true, executing = false, executing_by = NULL, claimed_at = NULL
    WHERE id = $1 AND executing_by = $2;
  `;

  try {
    const result = await db.query(query, [id, characterName]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error(`Failed to mark wishlist request ${id} as fulfilled: ${err}`);
    return false;
  }
}

/**
 * Releases a claim whose fulfilment didn't complete, so a later idle cycle can
 * pick it up again. Without this a failed or interrupted attempt would strand
 * the row (executing stays true, so it's never re-offered and never fulfilled).
 * Scoped to the claim holder so a character can't release someone else's claim.
 * @param id The wishlist row id
 * @param characterName The character that claimed the request
 * @returns true if a row was updated, false otherwise
 */
export async function markAsNotExecuting(
  id: number,
  characterName: string,
): Promise<boolean> {
  logger.debug(`Releasing ${characterName}'s claim on request ${id}`);
  const query = `
    UPDATE wishlist
    SET executing = false, executing_by = NULL, claimed_at = NULL
    WHERE id = $1 AND executing_by = $2;
  `;

  try {
    const result = await db.query(query, [id, characterName]);
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error(`Failed to release the claim on request ${id}: ${err}`);
    return false;
  }
}

/**
 * Releases the claims this character was holding. Run once at startup: a fresh
 * process has nothing of its own in flight, so any row it still holds was
 * stranded by an interrupted fulfilment (crash, restart, or error) and must be
 * made available again.
 *
 * Only this character's rows are touched — every character runs its own process
 * against the shared table, so releasing all of them would pull requests out
 * from under the characters actively working them. The lease clause is the
 * backstop for a character that never comes back; it's set well beyond any
 * realistic fulfilment so a live claim is never stolen. Rows with no owner
 * predate claim tracking.
 * @param characterName The character whose claims should be released
 * @returns the number of rows reset
 */
export async function reclaimExecutingWishlistRequests(
  characterName: string,
): Promise<number> {
  const query = `
    UPDATE wishlist
    SET executing = false, executing_by = NULL, claimed_at = NULL
    WHERE executing = true AND fulfilled = false
      AND (
        executing_by = $1
        OR executing_by IS NULL
        OR claimed_at < NOW() - INTERVAL '${STALE_CLAIM_HOURS} hours'
      );
  `;

  try {
    const result = await db.query(query, [characterName]);
    return result.rowCount ?? 0;
  } catch (err) {
    logger.error(`Failed to reclaim executing wishlist requests: ${err}`);
    return 0;
  }
}

/** A row that hasn't been delivered yet and hasn't run out of time */
const OpenRequest = `fulfilled = false
      AND (expiration_date IS NULL OR expiration_date > NOW())`;

/** Every row still worth looking at, delivered or not */
const LiveRequest = `(expiration_date IS NULL OR expiration_date > NOW())`;

/**
 * Finds a request for an item that the same asker already has outstanding, so a
 * need met by a row already in the table doesn't add a second one. A claimed
 * (`executing`) row counts: the item is on its way, so waiting on it beats
 * asking again.
 *
 * Scoped to one job, because a row is that job's blocking token — two jobs each
 * needing 25 steel bars need a row each, or one delivery of 25 resumes both and
 * leaves the second short. Omit `jobId` to look up the requests nothing is
 * waiting on, which are shared across the character's whole run.
 * @returns the open row, or undefined if there isn't one (also on error)
 */
export async function findOpenWishlistRequest(filter: {
  character: string;
  itemCode: string;
  jobId?: string;
}): Promise<WishlistRow | undefined> {
  const params: string[] = [filter.character, filter.itemCode];
  if (filter.jobId) {
    params.push(filter.jobId);
  }

  const query = `
    SELECT id, item_code, quantity, character,
           min_level, max_level, expiration_date,
           cost, currency, acquisition_method, job_id,
           executing, executing_by, claimed_at, fulfilled, created_at
    FROM wishlist
    WHERE character = $1
      AND item_code = $2
      AND ${filter.jobId ? 'job_id = $3' : 'job_id IS NULL'}
      AND ${OpenRequest}
    ORDER BY created_at ASC
    LIMIT 1;
  `;

  try {
    const result = await db.query<WishlistRow>(query, params);
    return result.rows[0];
  } catch (err) {
    logger.error(
      `Failed to look up an open request for ${filter.itemCode}: ${err}`,
    );
    return undefined;
  }
}

/**
 * Fetches the requests a job raised, fulfilled ones included, so callers can
 * tell "still waiting" from "everything arrived" from "the rows are gone".
 * @returns matching rows, or an empty array (also on error)
 */
export async function getWishlistRequestsForJob(
  character: string,
  jobId: string,
): Promise<WishlistRow[]> {
  const query = `
    SELECT id, item_code, quantity, character,
           min_level, max_level, expiration_date,
           cost, currency, acquisition_method, job_id,
           executing, executing_by, claimed_at, fulfilled, created_at
    FROM wishlist
    WHERE character = $1
      AND job_id = $2
      AND ${LiveRequest}
    ORDER BY created_at ASC;
  `;

  try {
    const result = await db.query<WishlistRow>(query, [character, jobId]);
    return result.rows;
  } catch (err) {
    logger.error(`Failed to fetch wishlist requests for job ${jobId}: ${err}`);
    return [];
  }
}

/**
 * Deletes the requests a job raised. Used when the job is dropped or can't be
 * parked: nothing else will ever consume them, and no other job can be waiting
 * on them because a row belongs to a single job.
 * @returns the number of rows deleted
 */
export async function deleteWishlistRequestsForJob(
  character: string,
  jobId: string,
): Promise<number> {
  const query = `
    DELETE FROM wishlist
    WHERE character = $1 AND job_id = $2;
  `;

  try {
    const result = await db.query(query, [character, jobId]);
    return result.rowCount ?? 0;
  } catch (err) {
    logger.error(`Failed to delete wishlist requests for job ${jobId}: ${err}`);
    return 0;
  }
}

/**
 * Deletes undelivered requests whose owning job is neither queued nor parked —
 * jobs that were cancelled, or lost because their saved form couldn't be rebuilt.
 * Requests nothing is waiting on (`job_id IS NULL`) are left to expire on their
 * own; they're wishes, not the leftovers of a dead job.
 * @param activeJobIds Every job id currently queued, parked or running
 * @returns the number of rows deleted
 */
export async function deleteOrphanedWishlistRequests(
  character: string,
  activeJobIds: string[],
): Promise<number> {
  const query = `
    DELETE FROM wishlist
    WHERE character = $1
      AND job_id IS NOT NULL
      AND NOT (job_id = ANY($2))
      AND fulfilled = false;
  `;

  try {
    const result = await db.query(query, [character, activeJobIds]);
    return result.rowCount ?? 0;
  } catch (err) {
    logger.error(`Failed to delete orphaned wishlist requests: ${err}`);
    return 0;
  }
}

/**
 * Hard-deletes every wishlist request whose expiration date has passed, so the
 * table doesn't accumulate dead rows. Run periodically (during idle jobs).
 * @returns the number of rows deleted
 */
export async function deleteExpiredWishlistRequests(): Promise<number> {
  const query = `
    DELETE FROM wishlist
    WHERE expiration_date IS NOT NULL AND expiration_date < NOW();
  `;

  try {
    const result = await db.query(query);
    return result.rowCount ?? 0;
  } catch (err) {
    logger.error(`Failed to delete expired wishlist requests: ${err}`);
    return 0;
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
