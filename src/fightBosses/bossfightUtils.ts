import { db } from '../db.js';
import { logger } from '../utils.js';

export async function registerBossFight(
  participants: string[],
): Promise<number> {
  try {
    for (const participant of participants) {
      const result = await db.query<{ participant: string }>(
        `
      INSERT INTO boss_fight_participants (
        character_name, role, state, reason, updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING fight_id;
      `,
        [
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
