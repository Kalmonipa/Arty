import { actionFight } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';

export class FightObjective extends Objective {
  target: ObjectiveTargets;
  participants?: string[];

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
  ) {
    super(character, `fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
    this.participants = participants;
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

    const mobInfo = await getMonsterInformation(this.target.code);
    if (mobInfo instanceof ApiError) {
      return this.character.handleErrors(mobInfo);
    }

    // ToDo: allow the fight sim to sim boss fights with multiple characterss
    if (mobInfo.data.type === 'normal') {
      for (
        let fightSimAttempts = 1;
        fightSimAttempts <= this.maxRetries;
        fightSimAttempts++
      ) {
        const fakeSchema = this.character.createFakeCharacterSchema(
          this.character.data,
        );
        logger.info(`Fight sim attempt ${fightSimAttempts}/${this.maxRetries}`);
        const simResult = await this.character.simulateFightNow(
          [fakeSchema],
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
    } else if (
      (!this.participants || this.participants.length === 0) &&
      mobInfo.data.type === 'boss'
    ) {
      logger.info(
        `${this.character.data.name} shouldn't fight ${mobInfo.data.name} alone`,
      );
      return false;
    } else {
      // For boss and elite monsters, skip fight simulation and return true
      logger.info('thisis achhange');
      return true;
    }
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!this.checkStatus()) return false;

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
        if (!this.checkStatus()) return false;

        logger.info(
          `Fought ${this.progress}/${this.target.quantity} ${this.target.code}s`,
        );

        await this.character.evaluateDepositItemsInBank(
          [this.target.code, this.character.preferredFood],
          contentLocation,
        );

        await this.character.recoverHealth();

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

        const response = await actionFight(
          this.character.data,
          this.participants,
        );

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

          await this.character.recoverHealth();

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
