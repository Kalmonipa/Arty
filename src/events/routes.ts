import { Router, Request, Response } from 'express';
import { Character } from '../character/characterClass.js';
import { db } from '../db.js';
import { logger } from '../utils.js';
import { AllCharNames } from '../constants.js';

export default function EventRouter(char: Character) {
  const router = Router();

  /**
   * Adds an event rule for the specified event for the specified character
   */
  router.post('/:eventCode', async (req: Request, res: Response) => {
    const { eventCode } = req.params; // Grabs from the URL

    try {
      const query = `
      INSERT INTO event_rules (event_code, character, ignore)
      VALUES ($1, $2, true)
      ON CONFLICT (event_code, character) 
      DO UPDATE SET ignore = true;
    `;
      await db.query(query, [eventCode, char.data.name]);

      const message = `Successfully restricted ${eventCode} for ${char.data.name}`;

      logger.info(message);

      return res.json({ message: message });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save rule' });
    }
  });

  /**
   * Delete the event rules for the character and event
   */
  router.delete('/:eventCode', async (req, res) => {
    const { eventCode } = req.params;

    try {
      const query = `
      DELETE FROM event_rules 
      WHERE event_code = $1 AND (character = $2 OR (character IS NULL AND $2 IS NULL));
    `;
      await db.query(query, [eventCode, char.data.name]);

      const message = `Successfully enabled ${eventCode} for ${char.data.name}`;

      logger.info(message);

      return res.json({ message: message });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to remove restriction' });
    }
  });

  /**
   * Adds an event rule for the specified event for ALL characters
   */
  router.post('/all/:eventCode', async (req: Request, res: Response) => {
    const { eventCode } = req.params; // Grabs from the URL

    let message = `Successfully restricted ${eventCode} for all characters`;

    try {
      AllCharNames.forEach(async (character) => {
        const query = `
            INSERT INTO event_rules (event_code, character, ignore)
            VALUES ($1, $2, true)
            ON CONFLICT (event_code, character) 
            DO UPDATE SET ignore = true;
            `;
        await db.query(query, [eventCode, character]);
      });

      logger.info(message);

      return res.json({ message: message });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save rule' });
    }
  });

  /**
   * Deletes event rules for ALL characters and event
   */
  router.delete('/all/:eventCode', async (req, res) => {
    const { eventCode } = req.params;

    const message = `Successfully enabled ${eventCode} for all characters`;

    try {
      AllCharNames.forEach(async (character) => {
        const query = `
      DELETE FROM event_rules 
      WHERE event_code = $1 AND (character = $2 OR (character IS NULL AND $2 IS NULL));
    `;
        await db.query(query, [eventCode, character]);
      });

      logger.info(message);

      return res.json({ message: message });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to remove restriction' });
    }
  });

  return router;
}
