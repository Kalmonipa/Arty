import { actionFight } from '../api_calls/Actions.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { MinEquippedUtilities } from '../constants.js';

/**
 * Gets initialised when the character has been selected to participate in a boss fight
 */
export class FightBossParticipantObjective extends Objective {
  target: ObjectiveTargets;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
  ) {
    super(
      character,
      `participate_bossfight_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'FightBossParticipant';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {

    return ObjectiveCompleted;
  }

  /**
   * @description Gear up for a fight and move to the location of the mob
   */
  async run(): Promise<ObjectiveResult> {

    // [] Gear up for the fight
    // [] Get food and potions
    // [] Move to the location of the boss
    // [] Mark themselves as ready in the boss_fight_participants table
    // [] ToDo: Some way for char to know fight has been initiated
    // [] Check fight count vs target count
    //    - If fights_done >= target then finish job and go back to prior job
    //    - If not, start from step 1 again

    return ObjectiveCompleted;
  }
}
