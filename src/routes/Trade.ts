import { Router, Request, Response } from 'express';
import { Character } from '../classes/Character.js';
import { TradeObjective } from '../classes/TradeWithNPCObjective.js';
import { TradeType } from '../types/NPCData.js';

export default function TradeRouter(char: Character) {
  const router = Router();

  router.post('/:tradeType', async (req: Request, res: Response) => {
    try {
      const { quantity, itemCode } = req.body;
      const tradeType: TradeType = req.params.tradeType as TradeType;

      if (!tradeType || isNaN(quantity) || !itemCode) {
        return res
          .status(400)
          .json({ error: 'Invalid tradeType, quantity or itemCode.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const job = new TradeObjective(char, tradeType, quantity, itemCode);

      await char.appendJob(job);

      return res.status(201).json({
        message: `${tradeType} ${quantity} ${itemCode} job added to queue.`,
        character: char.data.name,
        job: {
          id: job.objectiveId,
          tradeType: job.tradeType,
          itemCode: job.itemCode,
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
