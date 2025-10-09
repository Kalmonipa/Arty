import { actionFight } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { HealthStatus } from '../types/CharacterData.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';

export class FightObjective extends Objective {
  target: ObjectiveTargets;

  constructor(character: Character, target: ObjectiveTargets) {
    super(character, `fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    await this.character.evaluateDepositItemsInBank(
      [this.target.code, this.character.preferredFood],
      { x: this.character.data.x, y: this.character.data.y },
    );

    // Check amount of food in inventory to use after battles
    if (!(await this.character.checkFoodLevels())) {
      await this.character.topUpFood();
    }

    await this.character.evaluateGear('combat', this.target.code);

    for (
      let fightSimAttempts = 1;
      fightSimAttempts <= this.maxRetries;
      fightSimAttempts++
    ) {
      logger.info(`Fight sim attempt ${fightSimAttempts}/${this.maxRetries}`);
      const simResult = await this.character.simulateFightNow(
        structuredClone(this.character.data),
        this.target.code,
      );

      if (simResult === false) {
        await this.character.trainCombatLevelNow(
          this.character.data.level + 1,
        );
        // If this was the last attempt, return false
        if (fightSimAttempts === this.maxRetries) {
          return false;
        }
        continue;
      } else {
        return true;
      }
    }
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        return false;
      }

      logger.debug(`Fight attempt ${attempt}/${this.maxRetries}`);

      logger.info(`Finding location of ${this.target.code}`);

      const maps = await getMaps({ content_code: this.target.code });
      if (maps instanceof ApiError) {
        return this.character.handleErrors(maps);
      }

      if (maps.data.length === 0) {
        logger.error(`Cannot find any maps for ${this.target.code}`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps.data);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      for (
        this.progress;
        this.progress < this.target.quantity;
        this.progress++
      ) {
        if (this.isCancelled()) {
          logger.info(`${this.objectiveId} has been cancelled`);
          return false;
        }

        logger.info(
          `Fought ${this.progress}/${this.target.quantity} ${this.target.code}s`,
        );

        await this.character.evaluateDepositItemsInBank(
          [this.target.code, this.character.preferredFood],
          contentLocation,
        );

        let healthStatus: HealthStatus = this.character.checkHealth();

        if (healthStatus.percentage !== 100) {
          if (healthStatus.difference < 150) {
            await this.character.rest();
          } else {
            await this.character.eatFood();
          }
        }

        // Check these after each fight in case we need to top up
        if (
          this.character.data.utility1_slot_quantity <=
          this.character.minEquippedUtilities
        ) {
          if (await this.character.equipUtility('restore', 'utility1')) {
            // If we moved to the bank we need to move back to the monster location
            await this.character.move(contentLocation);
          }
        }

        const response = await actionFight(this.character.data);

        if (response instanceof ApiError) {
          const shouldRetry = await this.character.handleErrors(response);

          if (!shouldRetry || attempt === this.maxRetries) {
            logger.error(`Fight failed after ${attempt} attempts`);
            return false;
          }
          this.progress--;
          continue;
        } else {
          if (response.data.characters) {
            const charData = response.data.characters.find(
              (char) => char.name === this.character.data.name,
            );

            this.character.data = charData;
          } else {
            logger.error('Fight response missing character data');
            return false;
          }

          healthStatus = this.character.checkHealth();

          if (healthStatus.percentage !== 100) {
            if (healthStatus.difference < 150) {
              await this.character.rest();
            } else {
              await this.character.eatFood();
            }
          }

          // Check amount of food in inventory to use after battles
          if (
            this.character.preferredFood &&
            !(await this.character.checkFoodLevels())
          ) {
            await this.character.topUpFood(contentLocation);
          }
        }

        await this.character.saveJobQueue();
      }

      logger.debug(
        `Successfully fought ${this.target.quantity} ${this.target.code}`,
      );
      return true;
    }
  }
}
