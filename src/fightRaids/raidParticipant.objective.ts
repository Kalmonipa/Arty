import { findRaid } from '../api_calls/Raids.js';
import { Character } from '../character/character.js';
import { Objective } from '../core/Objective.js';
import { EvaluateGearObjective } from '../evaluateGear/evaluateGear.objective.js';
import {
  BossFightReady,
  BossFightRole,
  isBossFightOver,
} from '../fightBosses/bossFight.types.js';
import {
  getBossFightState,
  getCurrentNumFights,
} from '../fightBosses/bossFight.utils.js';
import {
  acceptBossFightCompletion,
  setParticipantsState,
} from '../fightBosses/bossFightParticipantFunctions.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';
import { logger, sleep } from '../utils.js';
import { RaidTarget } from './raid.types.js';

export class RaidParticipantObjective extends Objective {
  target: RaidTarget;
  role: BossFightRole;
  fightId: number;

  constructor(
    character: Character,
    target: RaidTarget,
    role: BossFightRole,
    fightId: number,
  ) {
    super(character, `participate_raid_${target.code}`, 'not_started');

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
   * @description Gears up for each fight the leader calls and stands on the
   * raid map until it does. A raid has no fight count to work towards, so the
   * only thing that ends this is the leader marking the fight over.
   */
  async run(): Promise<ObjectiveResult> {
    const charName = this.character.data.name;

    // Used to tell when a fight has been initiated. Once fights_done gets incremented in the DB
    // the participant knows that they need to go through the preparation routine again
    let progress = await getCurrentNumFights(this.fightId);
    let currentNumFights = progress;

    while (true) {
      const currentFightState = await getBossFightState(this.fightId);

      /**
       * However the leader ended it, the participant treats it the same way:
       * acknowledge, then go back to whatever it was doing
       */
      if (isBossFightOver(currentFightState)) {
        logger.info(
          `Raid ${this.target.code} has ${currentFightState}. Acknowledging and resuming prior activity`,
        );
        await acceptBossFightCompletion(this.fightId, charName);
        return ObjectiveCompleted;
      }

      // The enlistment names the raid; the gear has to be picked against the
      // monster the party actually fights
      const raid = await findRaid(this.target.code);
      if (!raid) {
        logger.warn(`Could not read the raid for ${this.target.code}. Exiting`);
        return ObjectiveFailed;
      }

      logger.info(`Attempting to gear up for the ${raid.code} raid`);
      const gearUpJob = await this.character.executeJobNow(
        new EvaluateGearObjective({
          character: this.character,
          activityType: 'combat',
          targetMob: raid.monster,
          bossFightRole: this.role,
        }),
      );
      if (!gearUpJob.success) {
        logger.warn(`Gearing up for the ${raid.code} raid has failed`);
        return ObjectiveFailed;
      }

      logger.info(`Finding location of ${raid.code}`);

      const maps = this.character.findMaps({ content_code: raid.code });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${raid.code}`);
        return ObjectiveFailed;
      }

      await this.character.move(this.character.evaluateClosestMap(maps));

      await setParticipantsState(this.fightId, charName, BossFightReady);

      // Once the fights_done has been incremented by the leader we break out of this loop and start the prep process
      // fights_done will get incremented after the fight cooldown has completed for the leader
      //
      // The state is polled alongside the counter because a fight the leader
      // ends early never increments it again. Watching the counter alone
      // leaves the character sleeping here for good; the loop above is what
      // acts on the state, so breaking out is enough to reach it.
      while (progress >= currentNumFights) {
        await sleep(10, 'raid_fight_sleep', true);

        if (isBossFightOver(await getBossFightState(this.fightId))) {
          break;
        }

        currentNumFights = await getCurrentNumFights(this.fightId);
      }
      progress = currentNumFights;
    }
  }
}
