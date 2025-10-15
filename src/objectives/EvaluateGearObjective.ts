import { logger } from '../utils.js';
import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { WeaponFlavours, GearEffects } from '../types/ItemData.js';
import { ItemSchema, ItemSlot, MonsterSchema } from '../types/types.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { ApiError } from './Error.js';
import { MonsterAttack, MonsterResistance } from '../types/MonsterData.js';

/**
 * @todo Should compare our current gear to see if it's good enough
 */

export class EvaluateGearObjective extends Objective {
  activityType: WeaponFlavours;
  targetMob?: string;

  constructor(
    character: Character,
    activityType: WeaponFlavours,
    targetMob?: string,
  ) {
    super(character, `evaluate_${activityType}_gear`, 'not_started');

    this.character = character;
    this.activityType = activityType;
    this.targetMob = targetMob;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Check current gear and equip anything that we're missing
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!await this.checkStatus()) return false;

      logger.debug(`Gear up attempt ${attempt}/${this.maxRetries}`);

      const charLevel =
        this.activityType === 'combat'
          ? this.character.getCharacterLevel()
          : this.character.getCharacterLevel(this.activityType);

      // Just check the weapon if we're doing a gathering task
      // ToDo: Find prospecting/wisdom gear for non-combat activities
      if (this.activityType !== 'combat') {
        return await this.checkGatheringWeapon(this.activityType, charLevel);
      } else {
        return await this.evaluateCombatGear(charLevel, this.targetMob);
      }
    }
  }

  /**
   * @description Evaluates gear in preparation for a fight
   */
  private async evaluateCombatGear(
    charLevel: number,
    targetMob: string,
  ): Promise<boolean> {
    // If we're not doing a gathering task, then we're fighting and should check all gear

    await this.character.recoverHealth();

    const mobInfo = await getMonsterInformation(targetMob);
    if (mobInfo instanceof ApiError) {
      return this.character.handleErrors(mobInfo);
    }

    logger.debug(`Setting array of monster attacks`);
    // Array of the mobs attack values, sorted from highest in 1st pos, to lowest in last pos
    const mobAttacks: MonsterAttack[] = [
      {
        type: 'attack_air' as const,
        counterType: 'res_air' as const,
        value: mobInfo.data.attack_air,
      },
      {
        type: 'attack_earth' as const,
        counterType: 'res_earth' as const,
        value: mobInfo.data.attack_earth,
      },
      {
        type: 'attack_fire' as const,
        counterType: 'res_fire' as const,
        value: mobInfo.data.attack_fire,
      },
      {
        type: 'attack_water' as const,
        counterType: 'res_water' as const,
        value: mobInfo.data.attack_water,
      },
    ].sort((a, b) => b.value - a.value);

    logger.debug(`Setting array of monster resistances`);
    // Array of the mobs resistance values, sorted from lowest in 1st pos to highest in last pos
    const mobResistances: MonsterResistance[] = [
      {
        type: 'res_air' as const,
        counterType: 'attack_air' as const,
        value: mobInfo.data.res_air,
      },
      {
        type: 'res_earth' as const,
        counterType: 'attack_earth' as const,
        value: mobInfo.data.res_earth,
      },
      {
        type: 'res_fire' as const,
        counterType: 'attack_fire' as const,
        value: mobInfo.data.res_fire,
      },
      {
        type: 'res_water' as const,
        counterType: 'attack_water' as const,
        value: mobInfo.data.res_water,
      },
    ].sort((a, b) => a.value - b.value);

    await this.topUpHealthPots();

    // This would take in the effects property to see what the best potion to equip
    await this.topUpSecondaryPots(mobInfo.data);
    

    logger.debug(`Finding best shield`);
    let equipResult: boolean;
    for (const attack of mobAttacks) {
      logger.info(
        `Finding best ${attack.counterType} shield against ${attack.value} ${attack.type}`,
      );
      equipResult = await this.checkGearOfType(
        'shield',
        attack.counterType,
        charLevel,
      );
      if (equipResult) {
        break;
      }
    }

    for (const resistance of mobResistances) {
      logger.info(
        `Finding best ${resistance.counterType} weapon against ${resistance.value} ${resistance.type}`,
      );
      equipResult = await this.checkCombatWeapon(
        resistance.counterType,
        charLevel,
      );
      if (equipResult) {
        break;
      }
    }

    // Check helmet
    await this.checkGearOfType('helmet', 'hp', charLevel);

    // Check armor
    await this.checkGearOfType('body_armor', 'hp', charLevel);

    // Check legs
    await this.checkGearOfType('leg_armor', 'hp', charLevel);

    // Check boots
    await this.checkGearOfType('boots', 'hp', charLevel);

    // Check rings
    await this.checkGearOfType('ring1', 'dmg', charLevel);
    await this.checkGearOfType('ring2', 'dmg', charLevel);

    // Check amulet
    await this.checkGearOfType('amulet', 'hp', charLevel);

    // Check health potions in utility slot 1
    if (
      this.character.data.utility1_slot_quantity <=
      this.character.minEquippedUtilities
    ) {
      await this.character.equipUtility('restore', 'utility1');
    }

    return true;
  }

  /**
   * @description Equips 100 health potions into the utility 1 slot
   * utility 1 is reserved for health potions
   * @returns
   */
  private async topUpHealthPots(): Promise<boolean> {
    if (
      this.character.data.utility1_slot_quantity <=
      this.character.minEquippedUtilities
    ) {
      return await this.character.equipUtility('restore', 'utility1');
    }
  }

  /**
   * @description Equips other potions (antidote, damage boost etc) into utility 2 slot
   * @todo Equip damage, resistance, etc pots if available
   */
  private async topUpSecondaryPots(mobInfo: MonsterSchema) {

    if (!mobInfo.effects) {
      if (this.character.data.utility2_slot_quantity > 0) { 
        return await this.character.unequipNow('utility2')
      } else {
        return true;
      }
    } else if (mobInfo.effects.length > 1) {
      logger.warn(`${mobInfo.code} has more than 1 effect. Not sure what to do`)
      return false;
    } else if (mobInfo.effects[0].code === 'poison') {
      return await this.character.equipUtility('antipoison', 'utility2')
    } else {
      logger.info(`Counter of ${mobInfo.effects[0].code} from ${mobInfo.code} not found.`)
      return false;
    }
  }

  /**
   * @todo Compare the strengths/weaknesses of the target mob if combat, and find best weapon for that
   * Otherwise equips the best available weapon for the gathering skill
   * @param activityType
   */
  private async checkCombatWeapon(
    targetEffect: GearEffects,
    charLevel: number,
  ): Promise<boolean> {
    const weapons = this.character.weaponMap['combat'];

    const bestWeapon = await this.identifyBestGear(
      weapons,
      targetEffect,
      charLevel,
    );
    if (bestWeapon === undefined) {
      logger.warn(`Found no good weapon for ${targetEffect}`);
      return false;
    }

    if (this.character.data.weapon_slot === bestWeapon.code) {
      logger.debug(`Already have ${bestWeapon.code} equipped`);
      return true;
    }

    logger.debug(`Attempting to equip ${bestWeapon.name} in weapon slot`);
    if (this.character.checkQuantityOfItemInInv(bestWeapon.code) > 0) {
      return await this.character.equipNow(bestWeapon.code, 'weapon');
    } else if (
      (await this.character.checkQuantityOfItemInBank(bestWeapon.code)) > 0
    ) {
      await this.character.withdrawNow(1, bestWeapon.code);
      return await this.character.equipNow(bestWeapon.code, 'weapon');
    } else {
      logger.debug(`Can't find any ${bestWeapon.name}`);
      return false;
    }
  }

  /**
   * @todo Compare the strengths/weaknesses of the target mob if combat, and find best weapon for that
   * Otherwise equips the best available weapon for the gathering skill
   * @param activityType
   */
  private async checkGatheringWeapon(
    activityType: WeaponFlavours,
    charLevel: number,
  ): Promise<boolean> {
    const weapons = this.character.weaponMap[activityType];

    for (let ind = weapons.length - 1; ind >= 0; ind--) {
      if (weapons[ind].level <= charLevel) {
        logger.debug(`Attempting to equip ${weapons[ind].name} for gathering`);
        if (this.character.checkQuantityOfItemInInv(weapons[ind].code) > 0) {
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else if (
          (await this.character.checkQuantityOfItemInBank(weapons[ind].code)) >
          0
        ) {
          await this.character.withdrawNow(1, weapons[ind].code);
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else {
          logger.debug(`Can't find any ${weapons[ind].name}`);
        }
      }
    }
    return false;
  }

  /**
   * @description Checks the gear that we could equip and looks for it in inv or bank. If available will equip it
   * @todo Check gear based on the mob we're going to fight. Equip best against their strengths/weaknesses
   * @param gearType The slot that we want to equip into
   * @param targetEffect Which effect we want to focus on
   * @param charLevel the characters combat level
   * @returns true if we successfully equipped something
   */
  private async checkGearOfType(
    gearType: ItemSlot,
    targetEffect: GearEffects,
    charLevel: number,
  ): Promise<boolean> {
    let map: ItemSchema[];
    switch (gearType) {
      case 'amulet':
        map = this.character.amuletMap[targetEffect];
        break;
      case 'body_armor':
        map = this.character.armorMap[targetEffect];
        break;
      case 'boots':
        map = this.character.bootsMap[targetEffect];
        break;
      case 'helmet':
        map = this.character.helmetMap[targetEffect];
        break;
      case 'leg_armor':
        map = this.character.legsArmorMap[targetEffect];
        break;
      case 'ring1':
        map = this.character.ringsMap[targetEffect];
        break;
      case 'ring2':
        map = this.character.ringsMap[targetEffect];
        break;
      case 'shield':
        map = this.character.shieldMap[targetEffect];
        break;
      default:
        logger.warn(
          `Checking gear of type ${gearType} is unavailable right now`,
        );
        return false;
    }

    const bestGear = await this.identifyBestGear(map, targetEffect, charLevel);
    if (bestGear === undefined) {
      logger.debug(`Found no good ${gearType} gear for ${targetEffect}`);
      return false;
    }

    if (this.character.getCharacterGearIn(gearType) === bestGear.code) {
      logger.info(`${bestGear.code} already equipped`);
      return true;
    }

    logger.debug(`Attempting to equip ${bestGear.name} for ${targetEffect}`);
    if (this.character.checkQuantityOfItemInInv(bestGear.code) > 0) {
      return await this.character.equipNow(bestGear.code, gearType);
    } else if (
      (await this.character.checkQuantityOfItemInBank(bestGear.code)) > 0
    ) {
      await this.character.withdrawNow(1, bestGear.code);
      return await this.character.equipNow(bestGear.code, gearType);
    } else {
      logger.debug(`Can't find any ${bestGear.name}`);
    }
  }

  /**
   * @description Iterates through all the gear within 10 levels of the character to find the one that suits best
   * @todo Make this work better. I've commented out the code that finds the best weapon because it wasn't working
   * as well as I'd like. Now it just gets the first, highest level weapon we have in inventory or bank and sets that
   * as the best, regardless of target mob strengths/weaknesses.
   * @param map
   * @param targetEffect
   * @param charLevel
   * @returns
   */
  private async identifyBestGear(
    map: ItemSchema[],
    targetEffect: GearEffects,
    charLevel: number,
  ): Promise<ItemSchema> {
    let bestGear: ItemSchema;

    for (let ind = map.length - 1; ind >= 0; ind--) {
      if (map[ind].level <= charLevel && map[ind].level > charLevel - 10) {
        // Iterate through all the options to find the one that gives the best target effect
        logger.debug(`Checking ${map[ind].code} for ${targetEffect}`);
        // If bestGear isn't set, set it to the highest level item that has that effect
        if (
          bestGear === undefined &&
          map[ind].effects &&
          map[ind].effects.find((effect) => effect.code === targetEffect)
        ) {
          // Check inventory
          let numHeld = this.character.checkQuantityOfItemInInv(map[ind].code);
          if (numHeld === 0) {
            // Check bank
            numHeld = await this.character.checkQuantityOfItemInBank(
              map[ind].code,
            );
          }

          if (numHeld > 0) {
            logger.debug(`bestGear not set yet. Setting to ${map[ind].code}`);
            bestGear = map[ind];
          } else {
            continue;
          }
        }
        //  else if (
        //   // The new item to check doesn't have the target effect, skip it
        //   !map[ind].effects.find((effect) => effect.code === targetEffect)
        // ) {
        //   continue;
        //   // If bestGear doesn't have the target effect, set the new item to bestGear
        //   // OR if the new item has a better effect, set that to bestGear
        // } else if (
        //   !bestGear.effects.find((effect) => effect.code === targetEffect) ||
        //   bestGear.effects.find((effect) => effect.code === targetEffect)
        //     .value <
        //     map[ind].effects.find((effect) => effect.code === targetEffect)
        //       .value
        // ) {
        //   // Check inventory
        //   let numHeld = this.character.checkQuantityOfItemInInv(map[ind].code);
        //   if (numHeld === 0) {
        //     // Check bank
        //     numHeld = await this.character.checkQuantityOfItemInBank(
        //       map[ind].code,
        //     );
        //   }

        //   if (numHeld > 0) {
        //     logger.info(
        //       `Found ${map[ind].code} is better than ${bestGear.code}`,
        //     );
        //     bestGear = map[ind];
        //   }
        // }
      }
    }

    return bestGear;
  }
}
