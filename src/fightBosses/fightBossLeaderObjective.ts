import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../character/ApiCalls.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { requestLoadout } from '../api_calls/Account.js';
import { BouncyBella, JumpyJimmy } from '../constants.js';
import { simulateBossFight } from './bossfightPreRequisite.js';
import {
  checkAllParticipantsReady,
  registerBossFight,
  registerBossFightParticipants,
} from './bossfightUtils.js';
import { EvaluateGearObjective } from '../core/EvaluateGearObjective.js';

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

    const participants = [BouncyBella, JumpyJimmy];

    const fightSimResult = await simulateBossFight(this.character, this.target);

    if (!fightSimResult.success) {
      logger.warn(
        `Boss fight against ${this.target.code} isn't winnable. Exiting`,
      );
      return ObjectiveFailed;
    }

    const fightId = await registerBossFight(this.character, this.target);

    const registerFightParticipants = await registerBossFightParticipants(
      fightId,
      participants,
    );

    // [x] Gear up for the fight
    //    - Equip gear, potions etc
    // [x] Move to the mob location
    // [] Check for ready status from both other participants
    // [] If not ready, sleep for 30 seconds (adjust as necessary)
    // [] If ready initiate fight
    // [] Set status of participants to unready in boss_fight_participants
    // [] Increment fights_done counter in boss_fights
    // [] If fights_done >= quantity:
    //    - set state to complete
    //    - delete rows from boss_fight_participants
    // [] If fights_done < quantity:
    //    - go back to step 1

    logger.info(`Attempting to gear up for ${this.target.code} fight`);
    const gearUpJob = await this.character.executeJobNow(
      new EvaluateGearObjective(this.character, 'combat', this.target.code),
    );
    if (!gearUpJob.success) {
      logger.warn(`Gearing up for ${this.target.code} fight has failed`);
      return ObjectiveFailed;
    }

    logger.info(`Finding location of ${this.target.code}`);

    const maps = this.character.findMaps({ content_code: this.target.code });
    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${this.target.code}`);
      return { complete: true, success: false, reason: 'failed' };
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move(contentLocation);

    // Check statuses
    const allReady = await checkAllParticipantsReady(fightId, participants);

    return ObjectiveCompleted;
  }
}
