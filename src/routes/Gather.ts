import { Router, Request, Response } from 'express';
import { GatherObjective } from '../classes/GatherObjective';
import { Character } from '../classes/Character';

export default function gatherRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const quantity = parseInt(req.body.quantity, 10);
      const itemCode = req.body.itemCode;
      const checkBank = req.body.checkBank || false;
      const includeInventory = req.body.includeInventory || false;

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

      const gatherJob = new GatherObjective(char, target, checkBank, includeInventory);

      char.appendJob(gatherJob);

      return res.status(201).json({
        message: 'Gather job added to queue.',
        character: char.data.name,

        job: {
          id: gatherJob.objectiveId,
          target: gatherJob.target,
          checkBank: gatherJob.checkBank,
          status: gatherJob.status,
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
