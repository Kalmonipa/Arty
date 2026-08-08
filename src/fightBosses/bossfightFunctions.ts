import { Character } from '../character/CharacterClass.js';
import { db } from '../db.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { logger } from '../utils.js';

/**
 * Registers the boss fight in the boss_fights table
 * @param target Target of the fight and number of fights to do
 */
export async function registerBossFight(
  character: Character,
  target: ObjectiveTargets,
): Promise<number> {
  try {
    const result = await db.query<{ id: number }>(
      `
      INSERT INTO boss_fights (
        boss_code, leader, quantity, state, fights_done, created_at, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '7 days')
      RETURNING id;
      `,
      [target.code, character.data.name, target.quantity, 'in_progress', 0],
    );
    logger.info(
      `${character.data.name} registered boss fight against ${target.quantity}x ${target.code}`,
    );
    return result.rows[0].id;
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return null;
  }
}

/**
 * Increment the fights_done counter in the boss_fights table
 * @param bossFightId ID of the fight in the DB
 * @returns
 */
export async function incrementBossFightCounter(
  bossFightId: number,
): Promise<number> {
  try {
    const result = await db.query<{ fights_done: number }>(
      `
      UPDATE boss_fights 
      SET fights_done = fights_done + 1
      WHERE id = $1
      RETURNING fights_done;
      `,
      [bossFightId],
    );
    logger.info(`Set fights_done to ${result.rows[0].fights_done}`);

    return result.rows[0].fights_done;
  } catch (err) {
    logger.error(`Failed to increment boss fight counter: ${err}`);
    return null;
  }
}

/**
 * Sets the state of the fight to complete in boss_fights
 * @param bossFightId ID of the fight in the DB
 * @returns
 */
export async function markBossFightComplete(
  bossFightId: number,
): Promise<boolean> {
  try {
    const result = await db.query<{ fights_done: number }>(
      `
      UPDATE boss_fights 
      SET state = "complete"
      WHERE id = $1
      `,
      [bossFightId],
    );
    logger.info(`Set state to complete for fight #${bossFightId}`);

    return true;
  } catch (err) {
    logger.error(`Failed to mark boss fight as complete: ${err}`);
    return false;
  }
}
