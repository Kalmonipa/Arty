import { Router, Request, Response } from 'express';
import { Character } from '../classes/Character';
import { TrainGatheringSkillObjective } from '../classes/TrainGatheringSkillObjective';
import { isGatheringSkill, logger } from '../utils';
import { GatheringSkill } from '../types/types';

export default function TrainSkillRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const targetLevel = parseInt(req.body.targetLevel, 10);
      const skillName: GatheringSkill = req.body.skill;

      if (isNaN(targetLevel) || !skillName) {
        logger.info(targetLevel);
        logger.info(skillName);
        return res
          .status(400)
          .json({ error: 'Invalid target level or skillName.' });
      }

      if (!isGatheringSkill(skillName)) {
        return res
          .status(400)
          .json({ error: 'Skill must be a gathering skill' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      const job = new TrainGatheringSkillObjective(
        char,
        skillName,
        targetLevel,
      );

      char.appendJob(job);

      return res.status(201).json({
        message: `Train ${skillName} skill job added to queue.`,
        character: char.data.name,
        job: {
          id: job.objectiveId,
          skillName: job.skill,
          targetLevel: job.targetLevel,
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
