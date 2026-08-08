import { db } from "../db.js";
import { logger } from "../utils.js";

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
): Promise<number> {
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
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return null;
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
      const result = await db.query<{}>(
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
    return null;
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
      const result = await db.query<{ state: string }>(
        `
      SELECT state FROM boss_fight_participants
      WHERE fight_id = $1 AND character_name = $2
      `,
        [bossFightId, participant],
      );
      logger.info(
        `${participant} is ${result.rows[0].state} for fight #${bossFightId}`,
      );
      allReady = result.rows[0].state;
    }
    return allReady;
  } catch (err) {
    logger.error(`Failed to get status: ${err}`);
    return null;
  }
}