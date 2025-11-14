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
  shouldEquipHealthPots = true;
  participants?: string[];
  runFightSim?: boolean;

  combatWeapon: string;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
    runFightSim?: boolean,
  ) {
    super(character, `fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
    this.participants = participants;
    this.runFightSim = runFightSim ?? true;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    const foodItems = this.character.findFoodInInventory();
    const foodCodes = foodItems.map((food) => food.code);
    const itemsToKeep = [...foodCodes];

    await this.character.evaluateDepositItemsInBank(itemsToKeep);

    await this.character.evaluateGear('combat', this.target.code);

    this.combatWeapon = this.character.data.weapon_slot;

    const mobInfo = await getMonsterInformation(this.target.code);
    if (mobInfo instanceof ApiError) {
      return this.character.handleErrors(mobInfo);
    }

    // ToDo: allow the fight sim to sim boss fights with multiple characterss
    if (mobInfo.data.type === 'normal') {
      if (this.runFightSim) {
        const fakeSchema = this.character.createFakeCharacterSchema(
          this.character.data,
          true,
        );

        // Find the highest potion that we could equip (and craft if needed) for the fight
        let potionNeeded: string = 'small_health_potion';
        for (const potion of this.character.utilitiesMap['restore'].reverse()) {
          if (
            potion.craft.level <= this.character.getCharacterLevel('alchemy') &&
            potion.craft.level <= this.character.getCharacterLevel()
          ) {
            potionNeeded = potion.code;
            break;
          }
        }
        fakeSchema.utility1_slot = potionNeeded;
        fakeSchema.utility1_slot_quantity = 100;

        logger.info(
          `Simulating fight against ${this.target.code} with health pots`,
        );
        const shouldFightWithHealthPots = await this.character.simulateFightNow(
          [fakeSchema],
          this.target.code,
        );

        if (shouldFightWithHealthPots && fakeSchema.utility1_slot_quantity) {
          const fakeSchema = this.character.createFakeCharacterSchema(
            this.character.data,
            false,
          );

          logger.info(
            `Simulating fight against ${this.target.code} without health pots`,
          );

          const shouldFightWithoutHealthPots =
            await this.character.simulateFightNow(
              [fakeSchema],
              this.target.code,
            );

          if (shouldFightWithoutHealthPots && this.character.data.utility1_slot) {
            const utilOnePot = this.character.data.utility1_slot;
            logger.info(`Unequipping ${utilOnePot} as not needed`);
            this.shouldEquipHealthPots = false;
            await this.character.unequipNow(
              'utility1',
              this.character.data.utility1_slot_quantity,
            );
            await this.character.depositNow(
              this.character.data.utility1_slot_quantity,
              utilOnePot,
            );
          } else if (
            !shouldFightWithoutHealthPots &&
            shouldFightWithHealthPots
          ) {
            await this.character.topUpHealthPots();
          }
        }

        if (shouldFightWithHealthPots === false) {
          return true;
        }
      }
      return true;
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
      return true;
    }
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

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

      await this.character.move(contentLocation);

      for (
        this.progress;
        this.progress < this.target.quantity;
        this.progress++
      ) {
        if (!(await this.checkStatus())) return false;

        logger.info(
          `Fought ${this.progress}/${this.target.quantity} ${this.target.code}s`,
        );

        // Get all food items to deposit
        const foodItems = this.character.findFoodInInventory();
        const foodCodes = foodItems.map((food) => food.code);
        const itemsToKeep = [...foodCodes];

        await this.character.evaluateDepositItemsInBank(
          itemsToKeep,
          contentLocation,
        );

        await this.character.recoverHealth();
        // If we start gathering then we may have a gathering tool equipped instead of a weapon
        // so we want to re-equip our fighting weapon
        if (this.character.data.weapon_slot !== this.combatWeapon) {
          await this.character.equipNow(this.combatWeapon, 'weapon');
        }
        // Move back after healing
        await this.character.move(contentLocation);

        // Check these after each fight in case we need to top up
        if (
          this.character.data.utility1_slot_quantity <=
            this.character.minEquippedUtilities &&
          this.shouldEquipHealthPots
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
          if (response.data && response.data.characters) {
            const charData = response.data.characters.find(
              (char) => char.name === this.character.data.name,
            );

            this.character.data = charData;
          } else {
            logger.error('Fight response missing character data');
            return false;
          }

          if (response.data.fight.result === 'loss') {
            logger.info(
              `Previous fight was a loss so will equip health potions for future fights`,
            );
            this.shouldEquipHealthPots = true;
          }

          await this.character.recoverHealth();
          // If we start gathering then we may have a gathering tool equipped instead of a weapon
          // so we want to re-equip our fighting weapon
          if (this.character.data.weapon_slot !== this.combatWeapon) {
            await this.character.equipNow(this.combatWeapon, 'weapon');
          }
          // then move back to the fighting location
          await this.character.move(contentLocation);

          // Check amount of food in inventory to use after battles
          if (!(await this.character.checkFoodLevels())) {
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
