import { Router, Request, Response } from 'express';
import { GatherObjective } from '../classes/GatherObjective.js';
import { Character } from '../classes/Character.js';
import { Objective } from '../classes/Objective.js';
import { MonsterTaskObjective } from '../classes/MonsterTaskObjective.js';
import { ItemTaskObjective } from '../classes/ItemTaskObjective.js';

export default function TaskRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const quantity = parseInt(req.body.quantity, 10);
      const taskType = req.body.taskType;

      if (isNaN(quantity) || !taskType) {
        return res.status(400).json({ error: 'Invalid quantity or taskType.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      var job: Objective;
      if (taskType === 'monsters') {
        job = new MonsterTaskObjective(char);
      } else if (taskType === 'items') {
        job = new ItemTaskObjective(char, quantity);
      } else
        return res
          .status(404)
          .json({ error: 'Task must be one of monsters or items' });

      char.appendJob(job);

      return res.status(201).json({
        message: `${taskType} job ${job.objectiveId} added to queue.`,
        character: char.data.name,
        job: {
          id: job.objectiveId,
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
