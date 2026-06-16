import { Router, Request, Response } from 'express';
import { Character } from '../core/Character.js';
import { db } from '../db.js';

export default function EventRouter(char: Character) {
  const router = Router();

  /**
   * Adds an event rule for the specified event
   */
  router.post('/events/:eventCode', async (req: Request, res: Response) => {
    const { eventCode } = req.params; // Grabs from the URL
  const { minLevel, maxLevel } = req.body;

  try {
    const query = `
      INSERT INTO event_rules (event_code, character, min_level, max_level, ignore)
      VALUES ($1, $2, $3, $4, true)
      ON CONFLICT (event_code, character) 
      DO UPDATE SET min_level = $3, max_level = $4, ignore = true;
    `;
    await db.query(query, [eventCode, char.data.name, minLevel || null, maxLevel || null]);
    
    return res.json({ message: `Successfully restricted ${eventCode} for ${char.data.name}` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save rule' });
  }
  });

  /**
   * Delete the event rules for the character and event
   */
  router.delete('/events/:eventCode', async (req, res) => {
  const { eventCode } = req.params;

  try {
    const query = `
      DELETE FROM event_rules 
      WHERE event_code = $1 AND (character = $2 OR (character IS NULL AND $2 IS NULL));
    `;
    await db.query(query, [eventCode, char.data.name || null]);

    return res.json({ message: `Successfully enabled ${eventCode} for ${char.data.name}` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove restriction' });
  }
});

  return router;
}
