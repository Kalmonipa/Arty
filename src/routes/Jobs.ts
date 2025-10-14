import { Router, Request, Response } from 'express';
import { Character } from '../objectives/Character.js';

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

      const jobs: string[] = char.listObjectives();

      return res.status(201).json({
        message: `${char.data.name} has ${jobs.length} jobs in queue`,
        character: char.data.name,
        jobs: [jobs],
        num_jobs: jobs.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * @description a list of all objectives with their parent-child relationships
   * @param char
   * @returns {Array<{id: string, parentId?: string, childId?: string, status: string}>}
   */
  router.get('/list/with-parents', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const jobs = char.listObjectivesWithParents();

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
   * @description Gets the complete job chain starting from a root job
   * @param char
   * @returns {string[]} Array of job IDs in the chain order
   */
  router.get('/chain/:rootJobId', async (req: Request, res: Response) => {
    try {
      const rootJobId = req.params.rootJobId;

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const jobChain = char.getJobChain(rootJobId);

      return res.status(200).json({
        message: `Job chain for ${rootJobId}`,
        character: char.data.name,
        rootJobId: rootJobId,
        chain: jobChain,
        chainLength: jobChain.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * @description Gets all cancelled jobs in the queue
   * @param char
   * @returns {string[]} Array of cancelled job IDs
   */
  router.get('/cancelled', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const cancelledJobs = char.getCancelledJobs();

      return res.status(200).json({
        message: `${char.data.name} has ${cancelledJobs.length} cancelled jobs`,
        character: char.data.name,
        cancelledJobs: cancelledJobs,
        num_cancelled: cancelledJobs.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * @description Manually saves the current job queue to disk
   */
  router.post('/save', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      await char.saveJobQueue();

      return res.status(200).json({
        message: `Job queue saved for ${char.data.name}`,
        character: char.data.name,
        numJobs: char.jobList.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * @description Cancels the given job and all its child jobs, removing them from the job queue
   * If the cancelled job is active, we must wait until an isCancelled check happens so the job
   * may not cancel immediately
   */
  router.post('/cancel/:objectiveId', async (req: Request, res: Response) => {
    try {
      const objId = req.params.objectiveId;

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      // Check if the job exists
      const obj = char.jobList.find((obj) => objId === obj.objectiveId);
      if (!obj) {
        return res.status(404).json({
          message: `Objective ${objId} not found`,
          character: char.data.name,
          jobs: char.listObjectives(),
        });
      }

      // Cancel the job and all its children
      const cancelledJobs = await char.cancelJobAndChildren(objId);

      return res.status(200).json({
        message: `Cancelled job ${objId} and ${cancelledJobs.length - 1} child jobs`,
        character: char.data.name,
        cancelledJobs: cancelledJobs,
        jobs: char.listObjectives(),
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  router.post('/pause', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      char.pauseJob();

      return res.status(200).json({
        message: `Paused job ${char.currentExecutingJob.objectiveId}`,
        character: char.data.name,
        jobs: char.listObjectives(),
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  router.post('/resume', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      char.resumeJob();

      return res.status(200).json({
        message: `Resumed job ${char.currentExecutingJob.objectiveId}`,
        character: char.data.name,
        jobs: char.listObjectives(),
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
