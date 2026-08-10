import { db } from '../db.js';
import { logger } from '../utils.js';
import { ParticipantStatus } from './types.js';

/**
 * Registers a row per participant in the boss_fight_participants table
 * Each participant will then update their state as they become ready for the fight
 * Ready means they:
 * - have good enough equipment
 * - have required potions & food
 * - are standing on the correct map
 * @param bossFightId ID of the fight
 * @param participants List of the participants
 * @returns
 */
export async function registerBossFightParticipants(
  bossFightId: number,
  participants: string[],
): Promise<boolean> {
  try {
    for (const participant of participants) {
      const result = await db.query<{ fight_id: number }>(
        `
      INSERT INTO boss_fight_participants (
        fight_id, character_name, role, state, reason, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING fight_id;
      `,
        [
          bossFightId,
          participant,
          'fighter',
          'unready', // Maybe this should just be a boolean?
          'boss fight',
        ],
      );
      logger.info(
        `Registered boss fight ${result.rows[0].fight_id} for ${participant}`,
      );
    }
    return true;
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return false;
  }
}

/**
 * Marks the participant as ready in the boss_fight_participants table
 * @param bossFightId ID of the fight in the DB
 * @returns
 */
export async function setParticipantsState(
  bossFightId: number,
  participant: string,
  state: ParticipantStatus,
): Promise<boolean> {
  try {
    const result = await db.query<{ state: ParticipantStatus }>(
      `
      UPDATE boss_fight_participants
      SET state = $3
      WHERE fight_id = $1 AND character_name = $2
      RETURNING state;
      `,
      [bossFightId, participant, state],
    );
    logger.info(
      `Set ${participant} to ${result.rows[0].state} for fight #${bossFightId}`,
    );
    return true;
  } catch (err) {
    logger.error(`Failed to set status of participants unready: ${err}`);
    return false;
  }
}

/**
 * Checks the participants status in the DB to see if they're ready
 * @param bossFightId ID of the fight
 * @param participants list of participants (min 0 max 2)
 * @returns true if all support participants are ready
 */
export async function checkAllParticipantsReady(
  bossFightId: number,
  participants: string[],
): Promise<boolean> {
  // If true then all participants are ready
  let allReady = false;

  try {
    for (const participant of participants) {
      const result = await db.query<{ state: ParticipantStatus }>(
        `
      SELECT state FROM boss_fight_participants
      WHERE fight_id = $1 AND character_name = $2
      `,
        [bossFightId, participant],
      );
      logger.info(
        `${participant} is ${result.rows[0].state} for fight #${bossFightId}`,
      );
      allReady = result.rows[0].state === 'ready';
      if (!allReady) {
        return false;
      }
    }
    return allReady;
  } catch (err) {
    logger.error(`Failed to get status: ${err}`);
    return false;
  }
}

/**
 * This function is used by participants to acknowledge that the boss fight sequence
 * has been completed. After this participants will resume their prior activities.
 *
 * 'acknowledged' is the terminal state: the row stays as a record of the fight,
 * and checkEnlistments skips it so the character is never called back to it.
 * @param bossFightId ID of the fight
 * @param participant Name of the character acknowledging the fight
 * @returns
 */
export async function acceptBossFightCompletion(
  bossFightId: number,
  participant: string,
): Promise<boolean> {
  try {
    await db.query<{}>(
      `
      UPDATE boss_fight_participants
      SET state = 'acknowledged'
      WHERE fight_id = $1 AND character_name = $2
      `,
      [bossFightId, participant],
    );
    logger.info(`Accepted boss fight has completed [#${bossFightId}]`);
    return true;
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return null;
  }
}

/**
 * Checks whether a character has been called up to a boss fight that is still
 * running. Acknowledged rows are skipped, so a fight the character has already
 * seen through never calls it back.
 * @param participant Name of the character to check
 * @returns ID of the fight to join, or 0 when it is not enlisted in one
 */
export async function checkEnlistments(participant: string): Promise<number> {
  try {
    const result = await db.query<{ fight_id: number }>(
      `
      SELECT p.fight_id
      FROM boss_fight_participants p
      JOIN boss_fights f ON f.id = p.fight_id
      WHERE p.character_name = $1
        AND p.state <> 'acknowledged'
        AND f.state = 'in_progress'
      ORDER BY p.fight_id
      LIMIT 1;
      `,
      [participant],
    );

    // Not being enlisted is the normal case, so it returns quietly rather than
    // falling into the catch
    const enlistment = result.rows[0];
    if (!enlistment) {
      return 0;
    }

    logger.info(`${participant} is enlisted for fight #${enlistment.fight_id}`);
    return enlistment.fight_id;
  } catch (err) {
    logger.error(`Failed to get enlistments: ${err}`);
    return 0;
  }
}
