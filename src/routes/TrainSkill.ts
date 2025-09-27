import { Router, Request, Response } from 'express';
import { Character } from '../classes/Character.js';
import { TrainGatheringSkillObjective } from '../classes/TrainGatheringSkillObjective.js';
import { isGatheringSkill } from '../utils.js';
import { CraftSkill } from '../types/types.js';
import { TrainCraftingSkillObjective } from '../classes/TrainCraftingSkillObjective.js';

export default function TrainSkillRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const targetLevel = parseInt(req.body.targetLevel, 10);
      const skill: CraftSkill = req.body.skill;

      if (isNaN(targetLevel) || !skill) {
        return res
          .status(400)
          .json({ error: 'Invalid target level or skill.' });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let job: TrainGatheringSkillObjective | TrainCraftingSkillObjective;

      if (isGatheringSkill(skill)) {
        job = new TrainGatheringSkillObjective(char, skill, targetLevel);
      } else {
        job = new TrainCraftingSkillObjective(char, skill, targetLevel);
      }

      await char.appendJob(job);

      return res.status(201).json({
        message: `Train ${skill} skill job added to queue.`,
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
