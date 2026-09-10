import { actionFight } from '../api_calls/Actions.js';
import { findRaid } from '../api_calls/Raids.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { EvaluateGearObjective } from '../evaluateGear/evaluateGear.objective.js';
import { BossFightUnready } from '../fightBosses/bossFight.types.js';
import {
  incrementBossFightCounter,
  markBossFightAborted,
  markBossFightComplete,
  registerBossFight,
} from '../fightBosses/bossFight.utils.js';
import {
  checkAllParticipantsReady,
  registerBossFightParticipant,
  setParticipantsState,
} from '../fightBosses/bossFightParticipantFunctions.js';
import { simulateBossFight } from '../fightBosses/bossfightPreRequisite.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';
import { logger, sleep } from '../utils.js';
import { RaidTarget } from './raid.types.js';
import {
  isRaidRunning,
  RaidLeaderRole,
  RaidLossLimit,
  RaidRoster,
  RaidSimIterations,
  RaidWinRateThreshold,
} from './raid.utils.js';

export class RaidLeaderObjective extends Objective {
  target: RaidTarget;

  constructor(character: Character, target: RaidTarget) {
    super(character, `lead_raid_${target.code}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'LeadRaid';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Leads the fleet against a raid boss
   * - Simulate the fight to see whether the party survives it
   * - Muster the party and wait for everyone to report ready
   * - Fight until the boss dies or the party stops surviving
   * - Resume the participants activities so they can go back to what they were doing
   */
  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const raid = await findRaid(this.target.code);
    if (!raid) {
      logger.warn(`No raid found for ${this.target.code}. Exiting`);
      return ObjectiveFailed;
    }
    if (!isRaidRunning(raid)) {
      logger.warn(`Raid ${raid.code} is ${raid.status}, not active. Exiting`);
      return ObjectiveFailed;
    }

    const fightSimResult = await simulateBossFight(
      this.character,
      { code: raid.monster, quantity: RaidSimIterations },
      {
        roster: RaidRoster,
        leaderRole: RaidLeaderRole,
        winRateThreshold: RaidWinRateThreshold,
      },
    );

    if (!fightSimResult.success) {
      logger.warn(
        `Raid ${raid.code} isn't survivable at a ${fightSimResult.winRate}% win rate. Exiting`,
      );
      logger.warn(
        `Simulated with ${fightSimResult.loadouts
          .map((loadout) => `${loadout.weapon_slot} [${loadout.level}]`)
          .join(', ')}`,
      );
      return ObjectiveFailed;
    }

    // boss_fights counts fights towards a target, which a raid has none of. The
    // quantity is a placeholder; the loop below ends on the raid's own state.
    const fightId = await registerBossFight(this.character, {
      code: raid.code,
      quantity: 1,
    });

    let fightFinished = false;
    try {
      const result = await this.leadFight(fightId, fightSimResult.variant);
      fightFinished = result.success;
      return result;
    } finally {
      if (!fightFinished && fightId) {
        await markBossFightAborted(fightId);
      }
    }
  }

  /**
   * @description Musters the party and fights the raid boss until it dies or
   * the party loses RaidLossLimit fights in a row. Registered fights are torn
   * down by the caller, so this is free to return early on any failure.
   */
  private async leadFight(
    fightId: number,
    gearVariant?: string,
  ): Promise<ObjectiveResult> {
    const participants = RaidRoster;
    let consecutiveLosses = 0;
    let fightsDone = 0;

    for (const participant of participants) {
      if (
        !(await registerBossFightParticipant({
          bossFightId: fightId,
          participant,
          isRaid: true,
        }))
      ) {
        logger.error(
          `Failed to register ${participant.characterName} as a ${participant.role}`,
        );
        return ObjectiveFailed;
      }
    }

    while (true) {
      // Re-read before every fight: the shared HP pool takes the whole server's
      // damage, so the boss can die between our fights, and the window can close
      const raid = await findRaid(this.target.code);
      if (!raid) {
        logger.warn(
          `Could not read the raid for ${this.target.code}. Standing the party down`,
        );
        return ObjectiveFailed;
      }
      if (!isRaidRunning(raid)) {
        logger.info(
          `Raid ${raid.code} is ${raid.status} after ${fightsDone} fights. Standing the party down`,
        );
        await markBossFightComplete(fightId);
        return ObjectiveCompleted;
      }

      logger.info(`Attempting to gear up for the ${raid.code} raid`);
      const gearUpJob = await this.character.executeJobNow(
        new EvaluateGearObjective({
          character: this.character,
          activityType: 'combat',
          targetMob: raid.monster,
          bossFightRole: RaidLeaderRole,
          gearVariant,
        }),
      );
      if (!gearUpJob.success) {
        logger.warn(`Gearing up for the ${raid.code} raid has failed`);
        return ObjectiveFailed;
      }

      logger.info(`Finding location of ${raid.code}`);

      // The map is keyed by the raid, not by the monster standing on it
      const maps = this.character.findMaps({ content_code: raid.code });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${raid.code}`);
        return ObjectiveFailed;
      }

      await this.character.move(this.character.evaluateClosestMap(maps));

      let allReady = await checkAllParticipantsReady(fightId, participants);

      // Sleep for a period until all participants are ready
      while (!allReady) {
        await sleep(30, 'waiting_for_participants');

        allReady = await checkAllParticipantsReady(fightId, participants);
      }

      const response = await actionFight(
        this.character.data,
        participants.map((participant) => participant.characterName),
      );

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

      fightsDone = await incrementBossFightCounter(fightId);

      // A lost raid fight puts nothing on the shared pool, so a party that keeps
      // dying is spending cooldowns for no reward credit at all
      const { result, turns } = response.data.fight;
      if (result === 'win') {
        consecutiveLosses = 0;
        logger.info(
          `Survived ${turns} turns against ${raid.monster} (fight ${fightsDone})`,
        );
      } else {
        consecutiveLosses += 1;
        logger.warn(
          `Died on turn ${turns} against ${raid.monster} (${consecutiveLosses}/${RaidLossLimit} losses in a row)`,
        );
      }

      if (consecutiveLosses >= RaidLossLimit) {
        logger.warn(
          `Lost ${RaidLossLimit} raid fights in a row against ${raid.monster}. Giving up`,
        );
        return ObjectiveFailed;
      }
    }
  }
}
