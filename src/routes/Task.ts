import { Router, Request, Response } from 'express';
import { GatherObjective } from '../classes/GatherObjective';
import { Character } from '../classes/Character';
import { Objective } from '../classes/Objective';
import { MonsterTaskObjective } from '../classes/MonsterTaskObjective';
import { ItemTaskObjective } from '../classes/ItemTaskObjective';

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
        new MonsterTaskObjective(char);
      } else if (taskType === 'items') {
        new ItemTaskObjective(char);
      } else
        return res
          .status(404)
          .json({ error: 'Task must be one of monsters or items' });

      char.jobList.push(job);

      return res.status(201).json({
        message: 'Gather job added to queue.',
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
