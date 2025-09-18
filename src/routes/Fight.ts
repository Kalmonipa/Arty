import { Router, Request, Response } from 'express';
import { CraftObjective } from '../classes/CraftObjective.js';
import { Character } from '../classes/Character.js';
import { EquipObjective } from '../classes/EquipObjective.js';
import { FightObjective } from '../classes/FightObjective.js';

export default function FightRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { quantity, itemCode } = req.body;

      if (isNaN(quantity) || !itemCode) {
        return res.status(400).json({ error: 'Invalid quantity or itemCode.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const job = new FightObjective(char, {
        code: itemCode,
        quantity: quantity,
      });

      char.appendJob(job);

      return res.status(201).json({
        message: `Fight job ${job.objectiveId} added to queue.`,
        character: char.data.name,

        job: {
          id: job.objectiveId,
          itemCode: job.target.code,
          quantity: job.target.quantity,
          status: job.status,
        },
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
