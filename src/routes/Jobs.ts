import { Router, Request, Response } from 'express';
import { Character } from '../classes/Character';
import { Objective } from '../classes/Objective';

export default function JobsRouter(char: Character) {
  const router = Router();

  router.get('/list/all', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let jobs: Objective[] = char.unstartedJobList;

      return res.status(201).json({
        message: `${char.data.name} has ${jobs.length} jobs in queue`,
        character: char.data.name,
        jobs: jobs,
        num_jobs: jobs.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  router.post('/cancel/active', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const activeJob = this.character.activeJob;
      this.character.activeJob = undefined;

      return res.status(201).json({
        message: `${activeJob.objectiveId} has been removed from active queue`,
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
