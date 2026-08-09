import { actionFight } from '../api_calls/Actions.js';
import { logger, sleep } from '../utils.js';
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
import {
  getBossFightState,
  getCurrentNumFights,
} from './bossfightFunctions.js';
import { EvaluateGearObjective } from '../core/EvaluateGearObjective.js';
import {
  acceptBossFightCompletion,
  setParticipantsState,
} from './bossFightParticipantFunctions.js';

/**
 * Gets initialised when the character has been selected to participate in a boss fight
 */
export class FightBossParticipantObjective extends Objective {
  target: ObjectiveTargets;
  fightId: number;

  constructor(character: Character, target: ObjectiveTargets, fightId: number) {
    super(
      character,
      `participate_bossfight_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'FightBossParticipant';
    this.target = target;
    this.fightId = fightId;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Gear up for a fight and move to the location of the mob
   */
  async run(): Promise<ObjectiveResult> {
    const charName = this.character.data.name;

    // Used to tell when a fight has been initiated. Once fights_done gets incremented in the DB
    // the participant knows that they need to go through the preparation routine again
    let progress = await getCurrentNumFights(this.fightId);
    let currentNumFights = progress;

    // Checks progress against target number but maybe should just be while true
    // and rely on the 'complete' state update from the leader?
    while (progress < this.target.quantity) {
      logger.info(`Started boss fight preparation against ${this.target.code}`);

      const currentFightState = await getBossFightState(this.fightId);

      /**
       * If boss fight is marked as 'complete' we need to acknowledge that it's completed
       * then the leader will clean up
       */
      if (currentFightState === 'complete' || currentFightState === 'aborted') {
        logger.info(
          `Boss fight against ${this.target.code} has ${currentFightState}. Acknowledging and resuming prior activity`,
        );
        await acceptBossFightCompletion(this.fightId, charName);
        return ObjectiveCompleted;
      } else {
        // [x] Gear up for the fight
        // [x] Get food and potions
        // [x] Move to the location of the boss
        // [x] Mark themselves as ready in the boss_fight_participants table
        // [x] ToDo: Some way for char to know fight has been initiated
        // [x] Check fight count vs target count
        //    - If fights_done >= target then finish job and go back to prior job
        //    - If not, start from step 1 again

        logger.info(`Attempting to gear up for ${this.target.code} fight`);
        const gearUpJob = await this.character.executeJobNow(
          new EvaluateGearObjective(this.character, 'combat', this.target.code),
        );
        if (!gearUpJob.success) {
          logger.warn(`Gearing up for ${this.target.code} fight has failed`);
          return ObjectiveFailed;
        }

        logger.info(`Finding location of ${this.target.code}`);

        const maps = this.character.findMaps({
          content_code: this.target.code,
        });
        if (maps.length === 0) {
          logger.error(`Cannot find any maps for ${this.target.code}`);
          return { complete: true, success: false, reason: 'failed' };
        }

        const contentLocation = this.character.evaluateClosestMap(maps);

        await this.character.move(contentLocation);

        await setParticipantsState(this.fightId, charName, 'ready');

        // Once the fights_done has been incremented by the leader we break out of this loop and start the prep process
        // fights_done will get incremented after the fight cooldown has completed for the leader (current char will
        // also be in cooldown so I could maybe just check cooldown status instead?)
        while (progress >= currentNumFights) {
          await sleep(10, 'boss_fight_sleep', true); // ToDo: doesn't need to log after debugging
          currentNumFights = await getCurrentNumFights(this.fightId);
        }
      }
    }

    logger.info(
      `Boss fight against ${this.target.quantity}x ${this.target.code} has completed`,
    );

    return ObjectiveCompleted;
  }
}
