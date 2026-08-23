import { actionFight } from '../api_calls/Actions.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
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
import { MonsterSchema, SimpleEffectSchema } from '../types/types.js';
import { MaxEquippedUtilities, MinEquippedUtilities } from '../constants.js';
import { Antidote, Restore } from '../names.js';

export class FightObjective extends Objective {
  target: ObjectiveTargets;
  useHealthPots: boolean;
  shouldEquipHealthPots: boolean;
  maxConsecutiveLosses = 3;
  lostTooManyFights = false;
  participants?: string[];
  runFightSim?: boolean;
  mobInfo?: MonsterSchema;

  combatWeapon: string;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
    runFightSim?: boolean,
    useHealthPots?: boolean,
  ) {
    super(character, `fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Fight';
    this.target = target;
    this.participants = participants;
    this.shouldEmitMetrics = true;
    this.metricLabel = target.code;
    this.runFightSim = runFightSim ?? true;
    this.useHealthPots = useHealthPots ?? true;
    this.shouldEquipHealthPots = this.useHealthPots;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    const foodItems = this.character.findFoodInInventory();
    const foodCodes = foodItems.map((food) => food.code);
    const itemsToKeep = [...foodCodes];

    await this.character.evaluateDepositItemsInBank(itemsToKeep);

    await this.character.evaluateGear('combat', this.target.code);

    this.combatWeapon = this.character.data.weapon_slot;

    const mobInfo = await getMonsterInformation(this.target.code);
    if (mobInfo instanceof ApiError) {
      await this.character.handleErrors(mobInfo);
      return ObjectiveFailed;
    }

    this.mobInfo = mobInfo.data;

    if (this.runFightSim) {
      return await this.decideOnHealthPotions(mobInfo.data);
    }

    return ObjectiveCompleted;
  }

  /**
   * @description Works out whether restore potions are what decides this fight
   * and stocks or drops utility1 to match.
   *
   * The `restore` effect fires on its own at the start of any turn the
   * character is below half health, so carrying potions is the same as
   * spending them. They are only worth equipping for a fight that is lost
   * without them and won with them.
   */
  private async decideOnHealthPotions(
    mob: MonsterSchema,
  ): Promise<ObjectiveResult> {
    const fakeSchema = this.character.createFakeCharacterSchema(
      this.character.data,
    );

    logger.info(
      `Simulating fight against ${this.target.code} with no utilities`,
    );
    if (
      (await this.character.simulateFightNow([fakeSchema], this.target.code))
        .success
    ) {
      await this.dropHealthPotions();
      return ObjectiveCompleted;
    }

    // Check if the mob has poison effect and check if we can win without antidotes
    const mobPoisonEffect: SimpleEffectSchema | undefined = mob.effects?.find(
      (effect) => effect.code === 'poison',
    );
    if (mobPoisonEffect) {
      const antidoteToEquip = this.character.utilitiesMap[Antidote].find(
        (potion) =>
          potion.effects.find(
            (effect) => effect.value === mobPoisonEffect.value,
          ),
      );
      fakeSchema.utility2_slot = antidoteToEquip.code;
      fakeSchema.utility2_slot_quantity = MaxEquippedUtilities;

      logger.info(
        `Simulating fight against ${this.target.code} with antidote pots`,
      );

      if (
        (await this.character.simulateFightNow([fakeSchema], this.target.code))
          .success
      ) {
        await this.dropHealthPotions();
        return ObjectiveCompleted;
      }

      await this.topUpSecondaryPots(mob);
    }

    if (!this.useHealthPots) {
      logger.info(
        `Cannot beat ${this.target.code} without restore potions. Skipping`,
      );
      return ObjectiveFailed;
    }

    const potionNeeded = this.bestRestorePotion();
    fakeSchema.utility1_slot = potionNeeded;
    fakeSchema.utility1_slot_quantity = MaxEquippedUtilities;

    logger.info(
      `Simulating fight against ${this.target.code} with ${potionNeeded}`,
    );
    if (
      !(await this.character.simulateFightNow([fakeSchema], this.target.code))
        .success
    ) {
      logger.info(
        `Fight sim against ${this.target.code} was a failure. Skipping`,
      );
      return ObjectiveFailed;
    }

    // The run with no utilities above already answered whether the fight is
    // winnable without potions, so there is nothing to gain from simulating
    // going without a second time
    logger.info(`${potionNeeded} is what wins this fight. Equipping`);
    this.shouldEquipHealthPots = true;
    return await this.character.equipUtility(Restore, 'utility1');
  }

  /**
   * @description Puts back any restore potions the character is carrying, for
   * a fight that does not need them to be won.
   */
  private async dropHealthPotions(): Promise<void> {
    this.shouldEquipHealthPots = false;

    // Read before unequipping, which empties the slot
    const potion = this.character.data.utility1_slot;
    const quantity = this.character.data.utility1_slot_quantity;
    if (potion === '' || quantity === 0) {
      return;
    }

    logger.info(`Unequipping ${quantity} ${potion} as not needed`);
    await this.character.unequipNow('utility1', quantity);
    await this.character.depositNow(quantity, potion);
  }

  /**
   * @description The restore potion the character would actually end up
   * wearing, picked the same way {@link Character.equipUtility} picks it so the
   * simulation tests the potion that goes into the slot.
   */
  private bestRestorePotion(): string {
    const restorePotions = this.character.utilitiesMap[Restore];
    const charLevel = this.character.getCharacterLevel(this.character.data);

    const usable = restorePotions
      .toReversed()
      .find((potion) => potion.level <= charLevel);

    if (!usable) {
      logger.debug(`No restore potion is low enough level to equip`);
      return restorePotions[0].code; // Usually small_health_potion
    }

    logger.debug(`Chose to equip ${usable.code}`);
    return usable.code;
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<ObjectiveResult> {
    let consecutiveLosses = 0;
    let fightAttempts = 1;

    if (!(await this.checkStatus())) return ObjectiveCancelled;

    logger.info(`Finding location of ${this.target.code}`);

    const maps = this.character.findMaps({ content_code: this.target.code });
    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${this.target.code}`);
      return ObjectiveFailed;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move(contentLocation);

    for (this.progress; this.progress < this.target.quantity; this.progress++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

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

      // Check these after each fight in case we need to top up
      if (
        this.character.data.utility1_slot_quantity <= MinEquippedUtilities &&
        this.shouldEquipHealthPots
      ) {
        await this.character.equipUtility(Restore, 'utility1');
      }

      // Move back after healing
      await this.character.move(contentLocation);

      const response = await actionFight(
        this.character.data,
        this.participants,
      );

      if (response instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(response);

        if (!shouldRetry || fightAttempts >= this.maxRetries) {
          logger.error(`Fight failed after ${fightAttempts} attempts`);
          return ObjectiveFailed;
        }
        fightAttempts++;
        this.progress--;
        continue;
      } else {
        fightAttempts = 1;
        if (response.data?.characters) {
          const charData = response.data.characters.find(
            (char) => char.name === this.character.data.name,
          );

          this.character.data = charData;
        } else {
          logger.error('Fight response missing character data');
          return ObjectiveFailed;
        }

        if (response.data.fight.result === 'loss') {
          consecutiveLosses++;
          logger.info(
            `Lost fight ${consecutiveLosses}/${this.maxConsecutiveLosses} against ${this.target.code}`,
          );
          // Losing a fight the sim called winnable means the verdict on
          // potions was wrong, so it gets retested rather than switching
          // potions on for the rest of the objective
          if (
            this.runFightSim &&
            this.useHealthPots &&
            !this.shouldEquipHealthPots &&
            this.mobInfo
          ) {
            const verdict = await this.decideOnHealthPotions(this.mobInfo);
            if (!verdict.success) {
              logger.warn(
                `Cannot beat ${this.target.code} even with potions. Stopping fight objective`,
              );
              return verdict;
            }
          }

          // Don't count a lost fight toward progress
          this.progress--;

          if (consecutiveLosses >= this.maxConsecutiveLosses) {
            this.lostTooManyFights = true;
            logger.warn(
              `Lost ${consecutiveLosses} fights in a row against ${this.target.code}. Stopping fight objective`,
            );
            return ObjectiveFailed;
          }
        } else {
          consecutiveLosses = 0;
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
    return ObjectiveCompleted;
  }

  /**
   * @description Equips other potions (antidote, damage boost etc) into utility 2 slot
   * @todo Equip damage, resistance, etc pots if available
   * @todo Only equip antidotes if we need them. Higher level chars probably don't need antidotes
   */
  private async topUpSecondaryPots(
    mobInfo: MonsterSchema,
  ): Promise<ObjectiveResult> {
    if (!mobInfo.effects || mobInfo.effects.length === 0) {
      return ObjectiveCompleted;
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
        return ObjectiveCompleted;
      }
    } else {
      logger.info(
        `Counter of ${mobInfo.effects[0].code} from ${mobInfo.code} not found.`,
      );
      return ObjectiveFailed;
    }
  }
}
