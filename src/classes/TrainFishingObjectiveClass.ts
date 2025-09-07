import { getResourceInformation } from '../api_calls/Resources';
import { DataPageResourceSchema } from '../types/types';
import { logger } from '../utils';
import { Character } from './CharacterClass';
import { Objective } from './ObjectiveClass';

export class TrainFishingObjective extends Objective {
  skill: string;
  targetLevel: number;

  constructor(character: Character, skill: string, targetLevel: number) {
    super(character, `train_${targetLevel}_${skill}`, 'not_started');
    this.character = character;
    this.targetLevel = targetLevel;
    this.skill = skill;
  }

  async execute(): Promise<boolean> {
    while (this.character.getCharacterLevel('fishing') < this.targetLevel) {
      const fishingTypes: DataPageResourceSchema = await getResourceInformation(
        {
          query: {
            skill: 'fishing',
            max_level: this.character.data.fishing_level,
          },
          url: '/resources',
        },
      );

      const resourceToGather =
        fishingTypes.data[fishingTypes.data.length - 1].drops[0].code;

      await this.character.gatherNow(
        this.character.data.inventory_max_items * 0.8,
        resourceToGather,
      );

      const numGathered =
        this.character.checkQuantityOfItemInInv(resourceToGather);

      // ToDo: Make this actually check for the type to craft
      await this.character.craftNow(numGathered, `cooked_${resourceToGather}`);

      await this.character.depositAllItems();
    }

    return true;
  }
}
