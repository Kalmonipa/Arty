import { Router, Request, Response } from 'express';
import { Character } from '../objectives/Character.js';
import { DepositObjective } from '../objectives/DepositObjective.js';

export default function DepositRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const quantity = parseInt(req.body.quantity, 10);
      const itemCode = req.body.itemCode;

      if (isNaN(quantity) || !itemCode) {
        return res.status(400).json({ error: 'Invalid quantity or itemCode.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const target = {
        code: itemCode,
        quantity: quantity,
      };

      const job = new DepositObjective(char, target);

      await char.appendJob(job);

      return res.status(201).json({
        message: `Deposit ${quantity} ${itemCode} job added to queue.`,
        character: char.data.name,

        job: {
          id: job.objectiveId,
          target: job.target,
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
