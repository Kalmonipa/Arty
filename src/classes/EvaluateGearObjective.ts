import { HealthStatus } from '../types/CharacterData.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { WeaponFlavours, GearEffects } from '../types/ItemData.js';
import { ItemSchema, ItemSlot, MonsterSchema } from '../types/types.js';

/**
 * @todo Should compare our current gear to see if it's good enough
 */

export class EvaluateGearObjective extends Objective {
  activityType: WeaponFlavours;
  targetMob?: MonsterSchema;

  constructor(
    character: Character,
    activityType: WeaponFlavours,
    targetMob?: MonsterSchema,
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
      if (this.isCancelled()) {
        logger.info(`${this.objectiveId} has been cancelled`);
        return false;
      }

      logger.debug(`Gear up attempt ${attempt}/${this.maxRetries}`);

      const charLevel =
        this.activityType === 'combat'
          ? this.character.getCharacterLevel()
          : this.character.getCharacterLevel(this.activityType);

      // Just check the weapon if we're doing a gathering task
      if (this.activityType !== 'combat') {
        // Check weapon and equip a suitable one if current isn't good
        if (!(await this.character.checkWeaponForEffects(this.activityType))) {
          await this.checkWeapon(this.activityType, charLevel);
        }
      } else {
        // If we're not doing a gathering task, then we're fighting and should check all gear

        const healthStatus: HealthStatus = this.character.checkHealth();

        if (healthStatus.percentage !== 100) {
          if (healthStatus.difference < 150) {
            await this.character.rest();
          } else {
            await this.character.eatFood();
          }
        }

        // ToDo: Check for the target mobs weakness and damage type so we can evaluate gear based on those

        await this.topUpHealthPots();

        await this.topUpSecondaryPots();

        // Check weapon and equip a suitable one if current isn't good
        if (!(await this.character.checkWeaponForEffects('combat'))) {
          await this.checkWeapon(this.activityType, charLevel);
        }

        // Check shield
        await this.checkGearOfType('shield', 'res_fire', charLevel);

        // Check helmet
        await this.checkGearOfType('helmet', 'hp', charLevel);

        // Check armor
        await this.checkGearOfType('body_armor', 'hp', charLevel);

        // Check legs
        await this.checkGearOfType('leg_armor', 'hp', charLevel);

        // Check boots
        await this.checkGearOfType('boots', 'hp', charLevel);

        // Check rings
        await this.checkGearOfType('ring1', 'dmg', charLevel)
        await this.checkGearOfType('ring2', 'dmg', charLevel)

        // Check amulet
        await this.checkGearOfType('amulet', 'hp', charLevel)
      }
      return true;
    }
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
   */
  private async topUpSecondaryPots() {
    // ToDo: Implement this
  }

  /**
   * @todo Compare the strengths/weaknesses of the target mob if combat, and find best weapon for that
   * Otherwise equips the best available weapon for the gathering skill
   * @param activityType
   */
  private async checkWeapon(
    activityType: WeaponFlavours,
    charLevel: number,
  ): Promise<boolean> {
    const weapons = this.character.weaponMap[activityType];

    for (let ind = weapons.length - 1; ind >= 0; ind--) {
      if (weapons[ind].level <= charLevel) {
        logger.debug(`Attempting to equip ${weapons[ind].name}`);
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
        break
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

    for (let ind = map.length - 1; ind >= 0; ind--) {
      if (map[ind].level <= charLevel) {
        if (this.character.getCharacterGearIn(gearType) === map[ind].code) {
          logger.info(`${map[ind].code} already equipped`)
          return true
        }

        logger.debug(`Attempting to equip ${map[ind].name}`);
        if (this.character.checkQuantityOfItemInInv(map[ind].code) > 0) {
          return await this.character.equipNow(map[ind].code, gearType);
        } else if (
          (await this.character.checkQuantityOfItemInBank(map[ind].code)) > 0
        ) {
          await this.character.withdrawNow(1, map[ind].code);
          return await this.character.equipNow(map[ind].code, gearType);
        } else {
          logger.debug(`Can't find any ${map[ind].name}`);
        }
      }
    }
    return false;
  }
}
