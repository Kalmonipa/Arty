import { logger, sleep } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { simulateBossFight } from './bossfightPreRequisite.js';
import {
  incrementBossFightCounter,
  markBossFightAborted,
  markBossFightComplete,
  registerBossFight,
} from './bossFight.utils.js';
import { EvaluateGearObjective } from '../evaluateGear/evaluateGear.objective.js';
import { actionFight } from '../api_calls/Actions.js';
import {
  checkAllParticipantsReady,
  registerBossFightParticipant,
  setParticipantsState,
} from './bossFightParticipantFunctions.js';
import {
  BossFightLeaderRole,
  BossFightRoster,
  BossFightUnready,
} from './bossFight.types.js';

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
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const fightSimResult = await simulateBossFight(this.character, this.target);

    if (!fightSimResult.success) {
      logger.warn(
        `Boss fight against ${this.target.code} isn't winnable at a ${fightSimResult.winRate}% win rate. Exiting`,
      );
      logger.warn(
        `Simulated with ${fightSimResult.loadouts
          .map((loadout) => `${loadout.weapon_slot} [${loadout.level}]`)
          .join(', ')}`,
      );
      return ObjectiveFailed;
    }

    const fightId = await registerBossFight(this.character, this.target);

    // Once the fight is registered every way out of it has to leave a terminal
    // state behind. The participants wake on fights_done, which stops moving
    // the moment this objective gives up, so a fight left in_progress keeps
    // them standing at the boss indefinitely. Hence the finally rather than an
    // abort at each early return: it also covers a thrown request and a
    // cancellation, and the next early return added can't forget it.
    let fightFinished = false;
    try {
      const result = await this.leadFight(fightId);
      fightFinished = result.success;
      return result;
    } finally {
      if (!fightFinished && fightId) {
        await markBossFightAborted(fightId);
      }
    }
  }

  /**
   * @description Musters the party and fights the boss the requested number of
   * times. Registered fights are torn down by the caller, so this is free to
   * return early on any failure.
   */
  private async leadFight(fightId: number): Promise<ObjectiveResult> {
    let progress = 0;
    const participants = BossFightRoster;

    for (const participant of participants) {
      if (!(await registerBossFightParticipant(fightId, participant))) {
        logger.error(
          `Failed to register ${participant.characterName} as a ${participant.role}`,
        );
        return ObjectiveFailed;
      }
    }

    while (progress < this.target.quantity) {
      logger.info(`Attempting to gear up for ${this.target.code} fight`);
      const gearUpJob = await this.character.executeJobNow(
        new EvaluateGearObjective({
          character: this.character,
          activityType: 'combat',
          targetMob: this.target.code,
          bossFightRole: BossFightLeaderRole,
        }),
      );
      if (!gearUpJob.success) {
        logger.warn(`Gearing up for ${this.target.code} fight has failed`);
        return ObjectiveFailed;
      }

      logger.info(`Finding location of ${this.target.code}`);

      const maps = this.character.findMaps({ content_code: this.target.code });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${this.target.code}`);
        return ObjectiveFailed;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move(contentLocation);

      // If there's just one participant we don't need to check statuses
      if (participants.length > 0) {
        // Check statuses
        let allReady = await checkAllParticipantsReady(fightId, participants);

        // Sleep for a period until all participants are ready
        while (!allReady) {
          await sleep(30, 'waiting_for_participants');

          allReady = await checkAllParticipantsReady(fightId, participants);
        }
      }

      const response = await actionFight(this.character.data, []);

      if (response instanceof ApiError) {
        logger.warn(
          `Fight responded with an [${response.error.code}] error: ${response.error.message}`,
        );
        return ObjectiveFailed;
      }

      for (const participant of participants) {
        await setParticipantsState(
          fightId,
          participant.characterName,
          BossFightUnready,
        );
      }

      progress = await incrementBossFightCounter(fightId);

      logger.info(
        `Fought ${progress}/${this.target.quantity} ${this.target.code}`,
      );

      if (progress >= this.target.quantity) {
        logger.info(
          `Successfully fought ${progress}/${this.target.quantity}x ${this.target.code}`,
        );
        // Participant rows are left in place. Each participant sees this state
        // change, acknowledges it and moves on, and its row stays as the record
        // of the fight.
        await markBossFightComplete(fightId);
        return ObjectiveCompleted;
      }
    }

    return ObjectiveCompleted;
  }
}
