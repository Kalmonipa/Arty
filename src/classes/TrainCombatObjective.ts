import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @description Finds a suitable mob to fight to level up the characters combat level until the desired level
 * Fights 10 mobs at a time
 */
export class TrainCombatObjective extends Objective {
  targetLevel: number;
  skill: string

  constructor(character: Character, targetLevel: number) {
    super(character, `train_combat_${targetLevel}`, 'not_started');
    this.character = character;
    this.targetLevel = targetLevel;
    this.skill = 'combat'
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let attempts = 0;
    let charLevel = this.character.getCharacterLevel();

    if (this.isCancelled()) {
      logger.info(`${this.objectiveId} has been cancelled`);
      return false;
    }

    const mobs = await getAllMonsterInformation({
      max_level: charLevel,
      min_level: Math.max(charLevel - 10, 0),
    });
    if (mobs instanceof ApiError) {
      this.character.handleErrors(mobs);
      return false;
    }

    while (charLevel < this.targetLevel && attempts < this.maxRetries) {

      for (let ind = mobs.data.length - 1; ind > 0; ind--) {
        const mob = mobs.data[ind];
        const fightSimResult = await this.character.simulateFightNow(
          structuredClone(this.character.data),
          undefined,
          mob,
        );
        
        if (fightSimResult) {
          const fightResult = await this.character.fightNow(10, mob.code);
          if (!fightResult) {
            attempts++;
          }
          charLevel = this.character.getCharacterLevel();
        }
        if (charLevel >= this.targetLevel) {
          logger.info(`Train to combat level ${this.targetLevel} achieved`);
          return true;
        } else if (attempts === this.maxRetries) {
          logger.warn(
            `${attempts}/${this.maxRetries} attempts to fight ${mob.code} reached. Failing job`,
          );
          return false;
        }
      }
    }

    logger.warn(`Found no suitable mobs to fight. Failing job`);
    return false;
  }
}
