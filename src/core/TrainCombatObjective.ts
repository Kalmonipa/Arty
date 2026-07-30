import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { BankCache } from './BankCache.js';
import { Objective } from './Objective.js';

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

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let attempts = 0;
    let charLevel = this.character.getCharacterLevel(this.character.data);

    if (!(await this.checkStatus())) return false;

    if (charLevel >= this.targetLevel) {
      logger.info(`Already at target combat level ${this.targetLevel}`);
      return true;
    }

    while (charLevel < this.targetLevel && attempts < this.maxRetries) {
      // Get fresh monster data for each attempt
      const mobs = await getAllMonsterInformation({
        max_level: charLevel,
        min_level: Math.max(charLevel - 10, 0),
      });
      if (mobs instanceof ApiError) {
        this.character.handleErrors(mobs);
        return false;
      }

      // One bank snapshot shared across every candidate-mob loadout simulation
      // this iteration; the bank is not mutated until we commit to a fight.
      const bankCache = await BankCache.create(this.character);

      let foundSuitableMob = false;
      let fightSuccessful = false;

      for (let ind = mobs.data.length - 1; ind >= 0; ind--) {
        if (!(await this.checkStatus())) return false;

        const mob = mobs.data[ind];

        const proposedLoadout = await this.character.proposeCombatLoadout(
          mob.code,
          bankCache,
        );

        const fightSimResult = await this.character.simulateFightNow(
          [proposedLoadout],
          mob.code,
        );

        if (fightSimResult) {
          foundSuitableMob = true;
          await this.character.evaluateGear('combat', mob.code);
          const fightResult = await this.character.fightNow(
            10,
            mob.code,
            undefined,
            false,
          );

          if (fightResult) {
            fightSuccessful = true;
            charLevel = this.character.getCharacterLevel(this.character.data);

            if (charLevel >= this.targetLevel) {
              logger.info(`Train to combat level ${this.targetLevel} achieved`);
              return true;
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
            logger.warn(
              `Found no suitable mobs to fight after ${attempts} attempts. Failing job`,
            );
          } else {
            logger.warn(
              `${attempts}/${this.maxRetries} attempts to fight reached. Failing job`,
            );
          }
          return false;
        }
        // Continue the while loop to try again with fresh monster data
      }
    }

    if (charLevel >= this.targetLevel) {
      logger.info(`Train to combat level ${this.targetLevel} achieved`);
      return true;
    }

    logger.warn(
      `Training incomplete after ${attempts} attempts. Current level: ${charLevel}, Target: ${this.targetLevel}`,
    );
    return false;
  }
}
