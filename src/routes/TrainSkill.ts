import { Router, Request, Response } from 'express';
import { Character } from '../objectives/Character.js';
import { TrainGatheringSkillObjective } from '../objectives/TrainGatheringSkillObjective.js';
import { isGatheringSkill } from '../utils.js';
import { CraftSkill, Skill } from '../types/types.js';
import { TrainCraftingSkillObjective } from '../objectives/TrainCraftingSkillObjective.js';
import { TrainCombatObjective } from '../objectives/TrainCombatObjective.js';

export default function TrainSkillRouter(char: Character) {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const targetLevel = parseInt(req.body.targetLevel, 10);
      const skill: CraftSkill | 'combat' = req.body.skill;

      if (isNaN(targetLevel) || !skill) {
        return res
          .status(400)
          .json({ error: 'Invalid target level or skill.' });
      }

      if (
        skill !== 'combat' &&
        !Object.values(Skill).includes(skill as Skill)
      ) {
        return res.status(400).json({
          error:
            'Invalid skill type. Must be one of alchemy, fishing, mining, woodcutting, cooking, jewelrycrafting, weaponcrafting, gearcrafting or combat',
        });
      }

      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let job:
        | TrainGatheringSkillObjective
        | TrainCraftingSkillObjective
        | TrainCombatObjective;

      if (skill === 'combat') {
        job = new TrainCombatObjective(char, targetLevel);
      } else if (skill === 'alchemy' && char.data.alchemy_level > 5) {
        // ToDo: Find a better way to find the level to start crafting potions
        job = new TrainCraftingSkillObjective(char, skill, targetLevel, 9);
      } else if (isGatheringSkill(skill)) {
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
