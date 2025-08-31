import { actionGather } from '../api_calls/Actions';
import { getItemInformation } from '../api_calls/Items';
import { getMaps } from '../api_calls/Maps';
import { getMonsterInformation } from '../api_calls/Monsters';
import { getResourceInformation } from '../api_calls/Resources';
import { ObjectiveTargets } from '../types/ObjectiveData';
import {
  DestinationSchema,
  GetAllMonstersMonstersGetResponse,
  ItemSchema,
  SimpleItemSchema,
} from '../types/types';
import { logger, sleep } from '../utils';
import { Character } from './CharacterClass';
import { CraftObjective } from './CraftObjectiveClass';
import { EquipObjective } from './EquipObjectiveClass';
import { ApiError } from './ErrorClass';
import { Objective } from './ObjectiveClass';

export class TrainFishingObjective extends Objective {
  skill: string;
  targetLevel: number;

  constructor(character: Character, skill: string, targetLevel: number) {
    super(character, `train_${skill}_${targetLevel}`, 'not_started');
    this.character = character;
    this.targetLevel = targetLevel;
    this.skill = this.skill;
  }

  async execute(): Promise<boolean> {
    return true;
  }
}
