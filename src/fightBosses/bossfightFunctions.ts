import { Character } from '../character/CharacterClass.js';
import { db } from '../db.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { logger } from '../utils.js';
import { BossFightStatus } from './types.js';

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
    const result = await db.query<{}>(
      `
      UPDATE boss_fights 
      SET state = 'complete'
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

/**
 * Takes in the boss fight ID and returns the monster code and quantity
 * @param bossFightId ID of the fight
 * @returns
 */
export async function getBossFightTarget(
  bossFightId: number,
): Promise<ObjectiveTargets | undefined> {
  try {
    const result = await db.query<ObjectiveTargets>(
      `
      SELECT boss_code AS code, quantity FROM boss_fights
      WHERE id = $1;
      `,
      [bossFightId],
    );

    const target = result.rows[0];
    if (!target) {
      logger.warn(`No boss fight found for #${bossFightId}`);
      return undefined;
    }

    logger.info(
      `Retrieved info for fight #${bossFightId}: ${target.quantity}x ${target.code}`,
    );
    return target;
  } catch (err) {
    logger.error(`Failed to get boss fight target info: ${err}`);
    return undefined;
  }
}

/**
 * Retrieves the state of the fight
 * @param bossFightId ID of the fight
 * @returns {BossFightStatus} status of the fight
 */
export async function getBossFightState(
  bossFightId: number,
): Promise<BossFightStatus> {
  try {
    const result = await db.query<{ state: BossFightStatus }>(
      `
      SELECT state FROM boss_fights
      WHERE id = $1;
      `,
      [bossFightId],
    );

    const state = result.rows[0];

    logger.info(`State of fight #${bossFightId}: ${state.state}`);
    return state.state;
  } catch (err) {
    logger.error(`Failed to get boss fight state: ${err}`);
    return undefined;
  }
}

/**
 * Retrieves the number of fights done
 * @param bossFightId ID of the fight
 * @returns number of fights_done
 */
export async function getCurrentNumFights(
  bossFightId: number,
): Promise<number> {
  try {
    const result = await db.query<{ numFights: number }>(
      `
      SELECT fights_done FROM boss_fights
      WHERE id = $1;
      `,
      [bossFightId],
    );

    const numFights = result.rows[0];

    logger.info(
      `Number of fights completed for #${bossFightId}: ${numFights.fights_done}`,
    );
    return numFights.fights_done;
  } catch (err) {
    logger.error(`Failed to get number of fights completed: ${err}`);
    return undefined;
  }
}
