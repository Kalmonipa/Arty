import { Character } from '../character/character.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';

export class RaidObjective extends Objective {
  target: ObjectiveTargets;
  runFightSim?: boolean;
  participant1Ready = false;
  participant2Ready = false;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `lead_raid_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'LeadRaid';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Participates in the raid mob
   * - Finds the best candidates to participate in the fight (Currently hardcoded to JumpyJimmy and BouncyBella)
   * - Get a loadout from each participant and build a FakeCharacterSchema for each
   * - Simulate the fight to see if we can win
   * - Wait until they have updated a row in their table to say theyr're ready
   * - Initiate the fight x amount of times
   * - Resume the participants activities so they can go back to what they were doing
   */
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}
