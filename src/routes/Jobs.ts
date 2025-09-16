import { Router, Request, Response } from 'express';
import { Character } from '../classes/Character';

export default function JobsRouter(char: Character) {
  const router = Router();

  /**
   * @description a list of all objective IDs in the objective queue
   * @param char 
   * @returns {string[]}
   */
  router.get('/list/all', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let jobs: string[] = char.listObjectives()

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

  /**
   * @description Cancels the given job, removing it from the job queue
   * If the cancelled job is active, we must wait until an isCancelled check happens so the job
   * may not cancel immediately
   */
  router.post('/cancel/:objectiveId', async (req: Request, res: Response) => {
    try {
      const objId = req.params.objectiveId

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let obj = char.jobList.find(obj => objId === obj.objectiveId)
      const result = char.cancelJob(obj)

      if ( !result ) {
        return res.status(404).json({
          message: `Objective ${obj.objectiveId} not found`,
          character: char.data.name,
          jobs: char.listObjectives()
        })
      } else {
        return res.status(200).json({
          message: `Objective ${obj.objectiveId} removed from queue`,
          character: char.data.name,
          jobs: char.listObjectives()
        });
    }
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
