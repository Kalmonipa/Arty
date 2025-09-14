import { Router, Request, Response } from 'express';
import { CraftObjective } from '../classes/CraftObjective';
import { Character } from '../classes/Character';
import { EquipObjective } from '../classes/EquipObjective';

export default function EquipRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { quantity, itemCode, itemSlot } = req.body;

      if (isNaN(quantity) || !itemCode || !itemSlot) {
        return res
          .status(400)
          .json({ error: 'Invalid quantity, itemSlot or itemCode.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const job = new EquipObjective(char, itemCode, itemSlot, quantity);

      char.appendJob(job);

      return res.status(201).json({
        message: 'Gather job ${job.objectiveId} added to queue.',
        character: char.data.name,

        job: {
          id: job.objectiveId,
          itemCode: job.itemCode,
          itemSlot: job.itemSlot,
          quantity: job.quantity,
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
