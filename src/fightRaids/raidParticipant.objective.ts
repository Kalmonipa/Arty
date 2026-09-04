import { Character } from '../character/character.js';
import { Objective } from '../core/Objective.js';
import { BossFightRole } from '../fightBosses/bossFight.types.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';

export class FightBossParticipantObjective extends Objective {
  target: ObjectiveTargets;
  role: BossFightRole;
  fightId: number;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    role: BossFightRole,
    fightId: number,
  ) {
    super(
      character,
      `participate_raid_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'RaidParticipant';
    this.target = target;
    this.role = role;
    this.fightId = fightId;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Gear up for a fight and move to the location of the mob
   */
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}
