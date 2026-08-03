import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../character/ApiCalls.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { requestLoadout } from '../api_calls/Account.js';
import { BouncyBella, JumpyJimmy } from '../constants.js';

export class FightBossLeaderObjective extends Objective {
  target: ObjectiveTargets;
  runFightSim?: boolean;
  participant1Ready = false;
  participant2Ready = false;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `lead_bossfight_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'LeadBossFight';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Fight the requested amount of boss mobs
   * - Finds the best candidates to participate in the fight (Currently hardcoded to JumpyJimmy and BouncyBella)
   * - Get a loadout from each participant and build a FakeCharacterSchema for each
   * - Simulate the fight to see if we can win
   * - Wait until they have updated a row in their table to say theyr're ready
   * - Initiate the fight x amount of times
   * - Resume the participants activities so they can go back to what they were doing
   */
  async run(): Promise<ObjectiveResult> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;
    }
    return ObjectiveCompleted;
  }
}
