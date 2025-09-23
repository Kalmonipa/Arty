import { getResourceInformation } from '../api_calls/Resources.js';
import { DataPageResourceSchema, GatheringSkill } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { GatherObjective } from './GatherObjective.js';
import { CraftObjective } from './CraftObjective.js';

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
        //this.character.removeJob(this.objectiveId);
        return false;
      }

      const resourceTypes: DataPageResourceSchema | ApiError =
        await getResourceInformation({
          skill: this.skill,
          max_level: charLevel,
        });
      if (resourceTypes instanceof ApiError) {
        return this.character.handleErrors(resourceTypes);
      }

      const resourceToGather =
        resourceTypes.data[resourceTypes.data.length - 1].drops[0].code;

      await this.character.executeJobNow(
        new GatherObjective(
          this.character,
          {
            code: resourceToGather,
            quantity: Math.round(this.character.data.inventory_max_items * 0.8),
          },
          false
        )
      );

      const numGathered =
        this.character.checkQuantityOfItemInInv(resourceToGather);

      // ToDo: Make this actually check for the type to craft instead of hardcoding 'cooked_'
      if (this.skill === 'fishing') {
        await this.character.executeJobNow(
          new CraftObjective(
            this.character,
            {
              code: `cooked_${resourceToGather}`,
              quantity: numGathered,
            }
          )
        );
      }

      await this.character.depositAllItems();

      charLevel = this.character.getCharacterLevel(this.skill);
    }
    return true;
  }
}
