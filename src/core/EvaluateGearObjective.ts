import { logger } from '../utils.js';
import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { WeaponFlavours, GearEffects } from '../types/ItemData.js';
import {
  ItemSchema,
  ItemSlot,
  MonsterSchema,
  ResourceSchema,
} from '../types/types.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { ApiError } from './Error.js';
import { MonsterAttack, MonsterResistance } from '../types/MonsterData.js';
import { MinEquippedUtilities } from '../constants.js';

/**
 * @description Evaluates which gear is the best to use for the upcoming fight
 * Should take in the
 */

export class EvaluateGearObjective extends Objective {
  activityType: WeaponFlavours;
  targetMob?: string;
  targetResource?: string;

  constructor(
    character: Character,
    activityType: WeaponFlavours,
    targetMob?: string,
    targetResource?: string,
  ) {
    super(character, `evaluate_${activityType}_gear`, 'not_started');

    this.character = character;
    this.jobFlavour = 'EvaluateGear';
    this.activityType = activityType;
    this.targetMob = targetMob;
    this.targetResource = targetResource;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Check current gear and equip anything that we're missing
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

      logger.debug(`Gear up attempt ${attempt}/${this.maxRetries}`);

      const charLevel =
        this.activityType === 'combat'
          ? this.character.getCharacterLevel(this.character.data)
          : this.character.getCharacterLevel(
              this.character.data,
              this.activityType,
            );

      // Just check the weapon if we're doing a gathering task
      if (this.activityType !== 'combat') {
        await this.checkGatheringWeapon(this.activityType, charLevel);
        await this.checkGatheringArtifacts(this.targetResource, charLevel);
        return true;
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
        atkCounterType: 'attack_air' as const,
        dmgCounterType: 'dmg_air' as const,
        value: mobInfo.data.res_air,
      },
      {
        type: 'res_earth' as const,
        atkCounterType: 'attack_earth' as const,
        dmgCounterType: 'dmg_earth' as const,
        value: mobInfo.data.res_earth,
      },
      {
        type: 'res_fire' as const,
        atkCounterType: 'attack_fire' as const,
        dmgCounterType: 'dmg_fire' as const,
        value: mobInfo.data.res_fire,
      },
      {
        type: 'res_water' as const,
        atkCounterType: 'attack_water' as const,
        dmgCounterType: 'dmg_water' as const,
        value: mobInfo.data.res_water,
      },
    ].sort((a, b) => a.value - b.value);

    // This would take in the effects property to see what the best potion to equip
    // await this.topUpSecondaryPots(mobInfo.data);

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
        `Finding best ${resistance.atkCounterType} weapon against ${resistance.value} ${resistance.type}`,
      );
      equipResult = await this.checkCombatWeapon(
        resistance.atkCounterType,
        charLevel,
      );
      if (equipResult) {
        break;
      }
    }

    // Check gear types with mob resistance priorities
    const gearTypes: ItemSlot[] = [
      'helmet',
      'body_armor',
      'leg_armor',
      'ring1',
      'ring2',
      'amulet',
    ];

    for (const gearType of gearTypes) {
      await this.checkGearWithResistancePriority(
        gearType,
        mobResistances,
        charLevel,
      );
    }

    // Check boots
    await this.checkGearOfType('boots', 'hp', charLevel);

    await this.checkRuneSlot();

    // // Check health potions in utility slot 1
    // if (
    //   this.character.data.utility1_slot_quantity <=
    //   this.character.minEquippedUtilities
    // ) {
    //   await this.character.equipUtility('restore', 'utility1');
    // }

    return true;
  }

  /**
   * @description Equips 100 health potions into the utility 1 slot
   * utility 1 is reserved for health potions
   * @returns
   */
  private async topUpHealthPots(): Promise<boolean> {
    if (this.character.data.utility1_slot_quantity <= MinEquippedUtilities) {
      return await this.character.equipUtility('restore', 'utility1');
    }
  }

  /**
   * @description Equips other potions (antidote, damage boost etc) into utility 2 slot
   * @todo Equip damage, resistance, etc pots if available
   * @todo Only equip antidotes if we need them. Higher level chars probably don't need antidotes
   */
  private async topUpSecondaryPots(mobInfo: MonsterSchema) {
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
      'weapon',
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
      return await this.character.equipNow(bestWeapon.code, 'weapon');
    } else {
      logger.debug(`Can't find any ${bestWeapon.name}`);
      return false;
    }
  }

  /**
   * @todo Compare the strengths/weaknesses of the target resource, and find best weapon for that
   * @param activityType
   */
  private async checkGatheringWeapon(
    activityType: WeaponFlavours,
    charLevel: number,
  ): Promise<boolean> {
    const weapons = this.character.weaponMap[activityType];

    for (let ind = weapons.length - 1; ind >= 0; ind--) {
      if (weapons[ind].level <= charLevel) {
        if (weapons[ind].code === this.character.data.weapon_slot) {
          logger.info(`Already have ${weapons[ind].code} equipped`);
          return true;
        }
        logger.debug(`Attempting to equip ${weapons[ind].name} for gathering`);
        if (this.character.checkQuantityOfItemInInv(weapons[ind].code) > 0) {
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else if (
          (await this.character.checkQuantityOfItemInBank(weapons[ind].code)) >
          0
        ) {
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else {
          logger.debug(`Can't find any ${weapons[ind].name}`);
        }
      }
    }
    return false;
  }

  /**
   * @description Selects the best prospecting or wisdom artifacts for gathering activities.
   * Checks drop rate of targetResource to decide between prospecting (rate > 1) or wisdom (rate === 1).
   * Falls back to wisdom artifacts if no targetResource, on API error, or if resource not found.
   */
  private async checkGatheringArtifacts(
    targetResource: string | undefined,
    charLevel: number,
  ): Promise<void> {
    if (!this.character.artifactsMap) {
      logger.warn('artifactsMap not built, skipping artifact evaluation');
      return;
    }

    let targetEffect: 'prospecting' | 'wisdom' = 'wisdom';

    if (targetResource) {
      const resources = await getAllResourceInformation({
        drop: targetResource,
      });
      if (resources instanceof ApiError) {
        logger.warn(
          `Failed to fetch resource info for ${targetResource}, defaulting to wisdom artifacts`,
        );
      } else {
        let resource: ResourceSchema | undefined;
        for (let i = resources.data.length - 1; i >= 0; i--) {
          const r = resources.data[i];
          if (
            r.level <=
            this.character.getCharacterLevel(this.character.data, r.skill)
          ) {
            resource = r;
            break;
          }
        }

        if (!resource) {
          logger.warn(
            `No accessible resource found for ${targetResource}, defaulting to wisdom artifacts`,
          );
        } else {
          const drop = resource.drops.find((d) => d.code === targetResource);
          if (!drop) {
            logger.warn(
              `${targetResource} not found in resource drops, defaulting to wisdom artifacts`,
            );
          } else {
            targetEffect = drop.rate > 1 ? 'prospecting' : 'wisdom';
            logger.info(
              `Drop rate for ${targetResource}: 1/${drop.rate} — equipping ${targetEffect} artifacts`,
            );
          }
        }
      }
    }

    const artifactSlots: ItemSlot[] = ['artifact1', 'artifact2', 'artifact3'];
    const artifacts = this.character.artifactsMap[targetEffect] ?? [];

    for (const slot of artifactSlots) {
      let slotFilled = false;

      // ToDo: Currently this will try to equip the same item in all 3 slots. 
      // Need to handle this better
      for (let i = artifacts.length - 1; i >= 0; i--) {
        if (artifacts[i].level > charLevel) {
          logger.debug(`${artifacts[i].code} is too high level (${artifacts[i].level}) for ${this.character.data.name} (${charLevel})`)
          continue;
        }
        

        if (this.character.hasEquipped(artifacts[i].code)) {
          logger.debug(`${artifacts[i].code} already equipped. Skipping`)
          break;
        }

        if (this.character.getCharacterGearIn(slot) === artifacts[i].code) {
          logger.debug(`${artifacts[i].code} already equipped in ${slot}`);
          slotFilled = true;
          break;
        }

        if (this.character.checkQuantityOfItemInInv(artifacts[i].code) > 0) {
          await this.character.equipNow(artifacts[i].code, slot);
          slotFilled = true;
          break;
        }

        if (
          (await this.character.checkQuantityOfItemInBank(artifacts[i].code)) >
          0
        ) {
          await this.character.withdrawNow(1, artifacts[i].code);
          await this.character.equipNow(artifacts[i].code, slot);
          slotFilled = true;
          break;
        }
      }

      if (!slotFilled) {
        logger.debug(`No ${targetEffect} artifact available for ${slot}`);
      }
    }
  }

  /**
   * @description Checks gear with priority based on mob resistances, falling back to 'dmg' if no good gear found
   * @param gearType The slot that we want to equip into
   * @param mobResistances Array of monster resistances sorted by priority
   * @param charLevel the characters combat level
   * @returns true if we successfully equipped something
   */
  private async checkGearWithResistancePriority(
    gearType: ItemSlot,
    mobResistances: MonsterResistance[],
    charLevel: number,
  ): Promise<boolean> {
    // Try each resistance type in order of priority (lowest resistance first)
    for (const resistance of mobResistances) {
      const success = await this.checkGearOfType(
        gearType,
        resistance.dmgCounterType,
        charLevel,
      );
      if (success) {
        logger.debug(
          `Successfully equipped ${gearType} with ${resistance.dmgCounterType} resistance`,
        );
        return true;
      }
    }

    // If no good gear found for any resistance type, fall back to 'dmg'
    logger.debug(
      `No good ${gearType} gear found for resistance types, trying 'dmg'`,
    );
    return await this.checkGearOfType(gearType, 'dmg', charLevel);
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

    const bestGear = await this.identifyBestGear(
      map,
      targetEffect,
      charLevel,
      gearType,
    );
    if (bestGear === undefined) {
      logger.debug(`Found no good ${gearType} gear for ${targetEffect}`);
      return false;
    }

    // Check if the gear is already equipped first
    if (this.character.getCharacterGearIn(gearType) === bestGear.code) {
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
    gearSlot: ItemSlot,
  ): Promise<ItemSchema> {
    let bestGear: ItemSchema;

    for (let ind = map.length - 1; ind >= 0; ind--) {
      if (map[ind].level <= charLevel && map[ind].level > charLevel - 15) {
        // Iterate through all the options to find the one that gives the best target effect
        logger.debug(`Checking ${map[ind].code} for ${targetEffect}`);
        // If bestGear isn't set, set it to the highest level item that has that effect
        if (
          bestGear === undefined &&
          map[ind].effects &&
          map[ind].effects.find((effect) => effect.code === targetEffect)
        ) {
          if (this.character.getCharacterGearIn(gearSlot) === map[ind].code) {
            logger.info(`${map[ind].code} already equipped`);
            return map[ind];
          }

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
      }
    }

    return bestGear;
  }

  /**
   * @description Checks the current rune equipped. Equips one if nothing currently equipped
   * Currently it just equips the healing rune
   * @todo Make it compare all runes.
   */
  private async checkRuneSlot(): Promise<boolean> {
    const runeName = 'healing_rune';

    const currentEquipped = this.character.data.rune_slot;

    logger.debug(
      `${this.character.data.name} currently has ${this.character.data.rune_slot} equipped in rune_slot`,
    );

    // If character doesn't have a rune equipped and is level 20 or greater, buy and equip a healing rune
    if (currentEquipped === '' && this.character.data.level >= 20) {
      if (await this.character.tradeWithNpcNow('buy', 1, runeName)) {
        const equipResponse = await this.character.equipNow(
          runeName,
          'rune',
          1,
        );
        if (equipResponse) {
          await this.character.updateAcquisitionsTable('rune', runeName);
          this.character.hasRune = true;
        }
      }
    }

    return true;
  }
}
