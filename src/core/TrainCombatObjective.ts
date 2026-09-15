import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from './Error.js';
import { BankCache } from './BankCache.js';
import { Objective } from './Objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

/** No mob in range could be beaten, as opposed to a mob being beaten and the fight going badly */
const NoWinnableMob = 'no_winnable_mob';

type TrainingRun = ObjectiveResult | typeof NoWinnableMob;

/**
 * @description Finds a suitable mob to fight to level up the characters combat level until the desired level
 * Fights 10 mobs at a time
 */
export class TrainCombatObjective extends Objective {
  targetLevel: number;
  skill: string;

  constructor(character: Character, targetLevel: number) {
    super(character, `train_${targetLevel}_combat`, 'not_started');
    this.character = character;
    this.jobFlavour = 'TrainCombat';
    this.targetLevel = targetLevel;
    this.skill = 'combat';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'combat';
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    if (
      this.character.getCharacterLevel(this.character.data) >= this.targetLevel
    ) {
      logger.info(`Already at target combat level ${this.targetLevel}`);
      return ObjectiveCompleted;
    }

    const dry = await this.trainTowardsTarget(false);
    if (dry !== NoWinnableMob) return dry;

    // Training is a job somebody queued deliberately, so a mob the character
    // can only take with restore potions still beats levelling nothing at all
    logger.info(
      `Nothing in range is winnable bare. Looking again with restore potions`,
    );

    const potioned = await this.trainTowardsTarget(true);
    if (potioned === NoWinnableMob) {
      logger.warn(
        `Found no suitable mobs to fight, with or without potions. Failing job`,
      );
      return ObjectiveFailed;
    }
    return potioned;
  }

  /**
   * @description Fights the best mob in range, ten at a time, until the target
   * level lands or the attempts run out.
   *
   * @param usePotions whether a mob that only wins on restore potions counts as
   * winnable, both for the simulation and for the fight that follows
   * @returns {@link NoWinnableMob} when every attempt ran out of candidates, so
   * the caller can decide whether a different loadout is worth trying
   */
  private async trainTowardsTarget(usePotions: boolean): Promise<TrainingRun> {
    let attempts = 0;
    let charLevel = this.character.getCharacterLevel(this.character.data);

    while (charLevel < this.targetLevel && attempts < this.maxRetries) {
      // Get fresh monster data for each attempt
      const mobs = await getAllMonsterInformation({
        max_level: charLevel,
        min_level: Math.max(charLevel - 10, 0),
      });
      if (mobs instanceof ApiError) {
        this.character.handleErrors(mobs);
        return ObjectiveFailed;
      }

      // One bank snapshot shared across every candidate-mob loadout simulation
      // this iteration; the bank is not mutated until we commit to a fight.
      const bankCache = await BankCache.create(this.character);

      // Simulating every candidate mob against an empty-looking bank would
      // conclude the character can beat none of them.
      if (bankCache.stale) {
        logger.warn('Could not read the bank; retrying this iteration later');
        return ObjectiveFailed;
      }

      let foundSuitableMob = false;
      let fightSuccessful = false;

      for (let ind = mobs.data.length - 1; ind >= 0; ind--) {
        if (!(await this.checkStatus())) return ObjectiveCancelled;

        const mob = mobs.data[ind];

        const proposedLoadout = await this.character.proposeCombatLoadout(
          mob.code,
          { cache: bankCache, usePotions: usePotions },
        );

        const fightSimResult = await this.character.simulateFightNow(
          [proposedLoadout],
          mob.code,
        );

        if (fightSimResult.success) {
          foundSuitableMob = true;
          await this.character.evaluateGear({
            activityType: 'combat',
            targetMob: mob.code,
            usePotions: usePotions,
          });
          const fightResult = await this.character.fightNow({
            quantity: 10,
            code: mob.code,
            runFightSim: false,
            useHealthPots: usePotions,
          });

          if (fightResult.success) {
            fightSuccessful = true;
            charLevel = this.character.getCharacterLevel(this.character.data);

            if (charLevel >= this.targetLevel) {
              logger.info(`Train to combat level ${this.targetLevel} achieved`);
              return ObjectiveCompleted;
            }
            break;
          }
        }
      }

      // If we didn't find a suitable mob or the fight failed, increment attempts
      if (!foundSuitableMob || !fightSuccessful) {
        attempts++;
        if (attempts >= this.maxRetries) {
          if (!foundSuitableMob) {
            return NoWinnableMob;
          }
          logger.warn(
            `${attempts}/${this.maxRetries} attempts to fight reached. Failing job`,
          );
          return ObjectiveFailed;
        }
        // Continue the while loop to try again with fresh monster data
      }
    }

    if (charLevel >= this.targetLevel) {
      logger.info(`Train to combat level ${this.targetLevel} achieved`);
      return ObjectiveCompleted;
    }

    logger.warn(
      `Training incomplete after ${attempts} attempts. Current level: ${charLevel}, Target: ${this.targetLevel}`,
    );
    return ObjectiveFailed;
  }
}
