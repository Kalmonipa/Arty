import { actionFight } from '../api_calls/Actions';
import { getMaps } from '../api_calls/Maps';
import { HealthStatus } from '../types/CharacterData';
import { logger } from '../utils';
import { Character } from './Character';
import { ApiError } from './Error';
import { Objective } from './Objective';
import { ObjectiveTargets } from '../types/ObjectiveData';

/**
 * @todo
 * - Check boost potions in utility slot 2, compare to monster we're fighting, equip better ones if we have any
 * - Check weapon to see if we can equip a better one
 * - Check each armor slot to see if we can equip better stuff
 */

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

    // Check health potions in utility slot 1 before we start
    if (
      this.character.data.utility1_slot_quantity <=
      this.character.minEquippedUtilities
    ) {
      await this.character.equipUtility('restore', 'utility1');
    }

    // Check weapon and equip a suitable one if current isn't good
    if (!(await this.character.checkWeaponForEffects('combat'))) {
      await this.character.equipBestWeapon('combat');
    }

    // ToDo: Check all armor to see if it's good

    // Check amount of food in inventory to use after battles
    if (!(await this.character.checkFoodLevels())) {
      await this.character.topUpFood();
    }

    return true;
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      logger.debug(`Fight attempt ${attempt}/${this.maxRetries}`);

      logger.info(`Finding location of ${this.target.code}`);

      const maps = (await getMaps(this.target.code)).data;

      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${this.target.code}`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

      await this.character.move({ x: contentLocation.x, y: contentLocation.y });

      for (var count = 0; count < this.target.quantity; count++) {
        logger.info(
          `Fought ${count}/${this.target.quantity} ${this.target.code}s`,
        );

        await this.character.evaluateDepositItemsInBank(
          [this.target.code, this.character.preferredFood],
          contentLocation,
        );

        const healthStatus: HealthStatus = this.character.checkHealth();

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

        // Check amount of food in inventory to use after battles
        if (!(await this.character.checkFoodLevels())) {
          await this.character.topUpFood(contentLocation);
        }

        const response = await actionFight(this.character.data);

        if (response instanceof ApiError) {
          const shouldRetry = await this.character.handleErrors(response);

          if (!shouldRetry || attempt === this.maxRetries) {
            logger.error(`Fight failed after ${attempt} attempts`);
            return false;
          }
          continue;
        } else {
          if (response.data.fight.result === 'loss') {
            logger.warn(
              `Fight was a ${response.data.fight.result}. Returned to ${response.data.character.x},${response.data.character.y}`,
            );
          } else if (response.data.fight.result === 'win') {
            logger.info(
              `Fight was a ${response.data.fight.result}. Gained ${response.data.fight.xp} exp and ${response.data.fight.gold} gold`,
            );
          }

          this.character.data = response.data.character;
        }
      }

      logger.debug(
        `Successfully fought ${this.target.quantity} ${this.target.code}`,
      );
      return true;
    }
  }
}
