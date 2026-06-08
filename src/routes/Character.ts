import { Router, Request, Response } from 'express';
import { Character } from '../core/Character.js';
import { isRole, logger } from '../utils.js';
import { ROLES } from '../types/CharacterData.js';
import { getCharacter } from '../api_calls/Character.js';
import { ApiError } from '../core/Error.js';

export default function CharacterRouter(char: Character) {
  const router = Router();

  router.post('/change-role', async (req: Request, res: Response) => {
    try {
      const newRole = req.body.newRole;

      if (!newRole) {
        return res.status(422).json({
          error: `Provide a role. Must be one of ${ROLES}`,
        });
      }

      if (!isRole(newRole)) {
        return res.status(404).json({
          error: `${newRole} is not a valid role. Must be one of ${ROLES}`,
        });
      }
      const oldRole = char.role;

      char.role = newRole;

      return res.status(201).json({
        message: `${char.data.name} now has role ${newRole} (was ${oldRole})`,
        character: char.data.name,
        previousRole: oldRole,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  router.post('/change-event-status', async (req: Request, res: Response) => {
    try {
      const eventStatus: boolean = req.body.eventStatus;

      const oldStatus = char.enableEvents;

      char.enableEvents = eventStatus;

      return res.status(201).json({
        message: `${char.data.name} enable events status is ${eventStatus} (previously ${oldStatus})`,
        character: char.data.name,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * Returns some information on the character
   * Idle status
   * Number of jobs in queue
   * Current job
   * Whether events are enabled or disabled
   */
  router.get('/info', async (req: Request, res: Response) => {
    try {
      return res.status(200).json({
        message: `Information for ${char.data.name}`,
        character: char.data.name,
        currentJob: char.activeJob?.objectiveId || 'none',
        enableEvents: char.enableEvents,
        idle: char.isIdle,
        jobsInQueue: char.jobList.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * Resets the character state to actual. Useful for when we pause a character to do manual actions
   */
  router.get('/reset', async (req: Request, res: Response) => {
    try {
      let charData = await getCharacter(char.data.name);
      if (charData instanceof ApiError) {
        logger.error(
          `Failed to get data for ${char.data.name}: [${charData.error.code}] ${charData.message}`,
        );
        return res.status(charData.error.code).json(charData.message);
      }

      char.data = charData;

      return res.status(200).json({
        message: `Character state for ${char.data.name} reset successfully`,
        character: char.data.name,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
