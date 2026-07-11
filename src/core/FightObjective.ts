import { actionFight } from '../api_calls/Actions.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { MonsterSchema, SimpleEffectSchema } from '../types/types.js';
import { MinEquippedUtilities } from '../constants.js';

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
    this.jobFlavour = 'Fight';
    this.target = target;
    this.participants = participants;
    this.shouldEmitMetrics = true;
    this.metricLabel = target.code;
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

    if (
      (!this.participants || this.participants.length === 0) &&
      mobInfo.data.type === 'boss'
    ) {
      logger.info(
        `${this.character.data.name} shouldn't fight ${mobInfo.data.name} alone`,
      );
      return false;
    }

    if (this.runFightSim) {
      const fakeSchema = this.character.createFakeCharacterSchema(
        this.character.data,
      );

      logger.info(
        `Simulating fight against ${this.target.code} with no utilities`,
      );
      if (
        await this.character.simulateFightNow([fakeSchema], this.target.code)
      ) {
        return true;
      }

      // Check if the mob has poison effect and check if we can win without antidotes
      let mobPoisonEffect: SimpleEffectSchema;
      if (mobInfo.data.effects) {
        mobPoisonEffect = mobInfo.data.effects.find(
          (effect) => effect.code === 'poison',
        );
      }
      if (mobPoisonEffect) {
        const antidoteToEquip = this.character.utilitiesMap['antipoison'].find(
          (potion) =>
            potion.effects.find(
              (effect) => effect.value === mobPoisonEffect.value,
            ),
        );
        fakeSchema.utility2_slot = antidoteToEquip.code;
        fakeSchema.utility2_slot_quantity = 100;

        logger.info(
          `Simulating fight against ${this.target.code} with antidote pots`,
        );

        if (
          await this.character.simulateFightNow([fakeSchema], this.target.code)
        ) {
          return true;
        }
      }

      // Find the highest potion that we could equip (and craft if needed) for the fight
      // ToDo: Don't craft if needed. The alchemist should be the only char to craft health potions
      let potionNeeded: string = this.character.utilitiesMap['restore'][0].code; // Usually small_health_potion
      for (const potion of this.character.utilitiesMap[
        'restore'
      ].toReversed()) {
        if (
          potion.craft.level <=
            this.character.getCharacterLevel(this.character.data, 'alchemy') &&
          potion.craft.level <=
            this.character.getCharacterLevel(this.character.data)
        ) {
          potionNeeded = potion.code;
          logger.debug(`Chose to equip ${potion.code}`);
          break;
        } else {
          logger.debug(`${potion.code} is too high level or cannot be crafted`);
        }
      }
      fakeSchema.utility1_slot = potionNeeded;
      fakeSchema.utility1_slot_quantity = 100;

      logger.info(
        `Simulating fight against ${this.target.code} with ${potionNeeded}`,
      );
      const shouldFightWithHealthPots = await this.character.simulateFightNow(
        [fakeSchema],
        this.target.code,
      );

      if (shouldFightWithHealthPots) {
        const fakeSchema = this.character.createFakeCharacterSchema(
          this.character.data,
        );

        logger.info(
          `Simulating fight against ${this.target.code} without ${potionNeeded}`,
        );

        const shouldFightWithoutHealthPots =
          await this.character.simulateFightNow([fakeSchema], this.target.code);

        if (shouldFightWithoutHealthPots) {
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
        } else if (!shouldFightWithoutHealthPots && shouldFightWithHealthPots) {
          await this.character.topUpHealthPots(potionNeeded);
        }
      }

      if (shouldFightWithHealthPots === false) {
        return true;
      }
    }
    return true;
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

      logger.debug(`Fight attempt ${attempt}/${this.maxRetries}`);

      logger.info(`Finding location of ${this.target.code}`);

      const maps = this.character.findMaps({ content_code: this.target.code });
      if (maps.length === 0) {
        logger.error(`Cannot find any maps for ${this.target.code}`);
        return false;
      }

      const contentLocation = this.character.evaluateClosestMap(maps);

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
          this.character.data.utility1_slot_quantity <= MinEquippedUtilities &&
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
          if (response.data?.characters) {
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

  /**
   * @description Equips other potions (antidote, damage boost etc) into utility 2 slot
   * @todo Equip damage, resistance, etc pots if available
   * @todo Only equip antidotes if we need them. Higher level chars probably don't need antidotes
   */
  private async topUpSecondaryPots(mobInfo: MonsterSchema): Promise<boolean> {
    if (!mobInfo.effects || mobInfo.effects.length === 0) {
      return true;
    } else if (mobInfo.effects.some((effect) => effect.code === 'poison')) {
      const poisonEffect = mobInfo.effects.find(
        (effect) => effect.code === 'poison',
      );
      logger.info(`${mobInfo.name} has the ${poisonEffect?.code} effect`);
      if (
        !this.character.data.utility2_slot_quantity ||
        (this.character.data.utility2_slot_quantity &&
          this.character.data.utility2_slot_quantity < MinEquippedUtilities)
      ) {
        logger.info(`Equipping antidotes`);
        return await this.character.equipAntiEffectUtility(
          'antipoison',
          poisonEffect,
        );
      } else {
        return true;
      }
    } else {
      logger.info(
        `Counter of ${mobInfo.effects[0].code} from ${mobInfo.code} not found.`,
      );
      return false;
    }
  }
}
