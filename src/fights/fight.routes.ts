import { Router, Request, Response } from 'express';
import { Character } from '../character/character.js';
import { FightObjective } from './fight.objective.js';
import { FightBossLeaderObjective } from '../fightBosses/bossFightLeader.objective.js';
import { simulateBossFight } from '../fightBosses/bossfightPreRequisite.js';

export default function FightRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { quantity, itemCode } = req.body;

      if (Number.isNaN(quantity) || !itemCode) {
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

      await char.appendJob(job);

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

  /**
   * Initiates a boss fight as the leader
   */
  router.post('/boss', async (req: Request, res: Response) => {
    try {
      const { quantity, targetMob } = req.body;

      if (Number.isNaN(quantity) || !targetMob) {
        return res
          .status(400)
          .json({ error: 'Invalid quantity or targetMob.' });
      }

      if (char === undefined || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const job = new FightBossLeaderObjective(char, {
        code: targetMob,
        quantity: quantity,
      });

      await char.appendJob(job);

      return res.status(201).json({
        message: `Boss fight job ${job.objectiveId} added to queue.`,
        character: char.data.name,
        job: {
          id: job.objectiveId,
          code: job.target.code,
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

  router.post('/boss/simulate', async (req: Request, res: Response) => {
    try {
      const { quantity, targetMob } = req.body;

      if (Number.isNaN(quantity) || !targetMob) {
        return res
          .status(400)
          .json({ error: 'Invalid quantity or targetMob.' });
      }

      if (char === undefined || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const result = await simulateBossFight(char, {
        code: targetMob,
        quantity: quantity,
      });

      return res.status(200).json({
        message: `Boss fight sim against ${targetMob} was a ${result.success ? 'win' : 'loss'}`,
        character: char.data.name,
        winRate: result.winRate,
        averageTurns: result.averageTurns,
        loadouts: result.loadouts,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error' });
    }
  });

  /**
   * Primarily used for boss fights. The leader will request a loadout from each participant
   * and use that loadout in the fight sim.
   */
  router.get('/propose-loadout', async (req: Request, res: Response) => {
    try {
      const { targetMob } = req.query;

      if (!targetMob || typeof targetMob !== 'string') {
        return res.status(400).json({
          error: 'Invalid or missing targetMob.',
        });
      }

      const proposedLoadout = await char.proposeCombatLoadout(targetMob);

      return res.status(200).json({
        message: `Proposed loadout for target mob ${targetMob}: helmet: ${proposedLoadout.helmet_slot}, weapon: ${proposedLoadout.weapon_slot}`,
        character: char.data.name,
        proposedLoadout,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
