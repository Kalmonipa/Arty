import { Router, Request, Response } from 'express';
import { Character } from '../core/Character.js';
import { isRole } from '../utils.js';
import { ROLES } from '../types/CharacterData.js';

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

  router.get('/info', async (req: Request, res: Response) => {
    try {
      return res.status(200).json({
        message: `Information for ${char.data.name}`,
        character: char.data.name,
        idle: char.isIdle,
        jobsInQueue: char.jobList.length,
        currentJob: char.activeJob || 'none',
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
