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
    const result = await db.query<{ participant: string }>(
      `
      INSERT INTO boss_fights (
        boss_code, leader, quantity, state, fights_done, created_at, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '7 days')
      RETURNING id;
      `,
      [target.code, character.data.name, target.quantity, 'unready', 0],
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

export async function registerBossFightParticipants(
  bossFightId: number,
  participants: string[],
): Promise<number> {
  try {
    for (const participant of participants) {
      const result = await db.query<{ participant: string }>(
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
        `Registered boss fight ${result.rows[0].id} for ${participant}`,
      );
    }
  } catch (err) {
    logger.error(`Failed to register boss fight: ${err}`);
    return null;
  }
}
