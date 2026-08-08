import { db } from '../db.js';
import { logger } from '../utils.js';
import { ParticipantStatus } from './types.js';

/**
 * Removes the boss fight participant from the DB after they've been accepted by said participant
 * @param bossFightId ID of the fight
 * @param participants List of the participants
 * @returns
 */
export async function deregisterBossFightParticipants(
  bossFightId: number,
): Promise<boolean> {
  try {
    const result = await db.query<{}>(
      `
      DELETE FROM boss_fight_participants 
      WHERE fight_id = $1 AND state = "accepted"
      `,
      [bossFightId],
    );
    logger.info(`Removed boss fight entries [#${bossFightId}]`);
    return true;
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return false;
  }
}

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
 * Primarily used after a fight. Leader will initiate this and then each participant will mark themselves
 * ready after doing their pre-fight checks
 * @param bossFightId ID of the fight in the DB
 * @param participants list of participants (min 0 max 2)
 * @returns
 */
export async function setAllParticipantsUnready(
  bossFightId: number,
  participants: string[],
): Promise<boolean> {
  try {
    for (const participant of participants) {
      const result = await db.query<{ state: ParticipantStatus }>(
        `
      UPDATE boss_fight_participants
      SET state = 'unready'
      WHERE fight_id = $1 AND character_name = $2
      `,
        [bossFightId, participant],
      );
      logger.info(
        `Set ${participant} to ${result.rows[0].state} for fight #${bossFightId}`,
      );
    }
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
      allReady = result.rows[0].state === 'ready' ? true : false;
    }
    return allReady;
  } catch (err) {
    logger.error(`Failed to get status: ${err}`);
    return false;
  }
}

/**
 * This function is used by participants to acknowledge that the boss fight sequence
 * has been completed. After this participants will resume their prior activities
 * and the leader can remove the rows from the DB
 * @param bossFightId ID of the fight
 * @returns
 */
export async function acceptBossFightCompletion(
  bossFightId: number,
  participant: string,
): Promise<boolean> {
  try {
    const result = await db.query<{}>(
      `
      UPDATE boss_fight_participants
      SET state = 'accepted'
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
