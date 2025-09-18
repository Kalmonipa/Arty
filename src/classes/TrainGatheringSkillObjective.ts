import { getResourceInformation } from '../api_calls/Resources';
import { DataPageResourceSchema, GatheringSkill } from '../types/types';
import { logger } from '../utils.js';
import { Character } from './Character';
import { Objective } from './Objective';

/**
 * @todo
 * - Alchemy requires crafting potions after level 30 to level up past. Gathering nettles doesn't provide exp at level 31
 */
export class TrainGatheringSkillObjective extends Objective {
  skill: GatheringSkill;
  targetLevel: number;

  constructor(
    character: Character,
    skill: GatheringSkill,
    targetLevel: number,
  ) {
    super(character, `train_${targetLevel}_${skill}`, 'not_started');
    this.character = character;
    this.targetLevel = targetLevel;
    this.skill = skill;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    var charLevel = this.character.getCharacterLevel(this.skill);
    while (charLevel < this.targetLevel) {
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        this.character.removeJob(this.objectiveId);
        return false;
      }

      const resourceTypes: DataPageResourceSchema =
        await getResourceInformation({
          query: {
            skill: this.skill,
            max_level: charLevel,
          },
          url: '/resources',
        });

      const resourceToGather =
        resourceTypes.data[resourceTypes.data.length - 1].drops[0].code;

      await this.character.gatherNow(
        Math.round(this.character.data.inventory_max_items * 0.8),
        resourceToGather,
        false,
      );

      const numGathered =
        this.character.checkQuantityOfItemInInv(resourceToGather);

      // ToDo: Make this actually check for the type to craft instead of hardcoding 'cooked_'
      if (this.skill === 'fishing') {
        await this.character.craftNow(
          numGathered,
          `cooked_${resourceToGather}`,
        );
      }

      await this.character.depositAllItems();

      charLevel = this.character.getCharacterLevel(this.skill);
    }
    return true;
  }
}
