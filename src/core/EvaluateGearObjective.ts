import {
  effectValueOf,
  logger,
  scoreWeaponAgainstResistances,
} from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { Objective } from './Objective.js';
import { WeaponFlavours, GearEffects } from '../types/ItemData.js';
import {
  FakeCharacterSchema,
  ItemSchema,
  ItemSlot,
  MonsterSchema,
  ResourceSchema,
} from '../types/types.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { ApiError } from './Error.js';
import { BankCache } from './BankCache.js';
import { MonsterAttack, MonsterResistance } from '../types/MonsterData.js';
import { MinEquippedUtilities } from '../constants.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

/**
 * @description Evaluates which gear is the best to use for the upcoming fight
 * @todo: This should request the best gear from the wishlist if we don't have it
 * and continue on to equip the best gear that we have
 */

export class EvaluateGearObjective extends Objective {
  activityType: WeaponFlavours;
  targetMob?: string;
  targetResource?: string;
  private bankCache?: BankCache;

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

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description Better gear is a wish, not a blocker: the character equips the
   * best it can lay hands on and gets on with the work. Leaving these requests
   * unowned keeps them from parking whatever job asked for the gear check, which
   * would otherwise stall on a full set of equipment nobody has crafted yet.
   */
  protected wishlistRequestOwner(): undefined {
    return undefined;
  }

  /**
   * @description Check current gear and equip anything that we're missing
   */
  async run(): Promise<ObjectiveResult> {
    this.bankCache = await BankCache.create(this.character);

    // A stale snapshot reads as an empty bank, so every slot would conclude we
    // own nothing and the whole retry loop could only ever decide to change
    // nothing. Give the shared request budget room to recover instead.
    if (this.bankCache.stale) {
      logger.warn('Could not read the bank; skipping this gear evaluation');
      return ObjectiveFailed;
    }

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;

      logger.debug(`Gear up attempt ${attempt}/${this.maxRetries}`);

      const charLevel =
        this.activityType === 'combat'
          ? this.character.getCharacterLevel(this.character.data)
          : this.character.getCharacterLevel(
              this.character.data,
              this.activityType,
            );

      // Gathering gear has no retriable failure mode, so evaluate once and finish
      if (this.activityType !== 'combat') {
        const overallLevel = this.character.getCharacterLevel(
          this.character.data,
        );
        const gatheringStat = await this.determineGatheringStat(
          this.targetResource,
        );
        await this.checkGatheringWeapon(this.activityType, charLevel);
        await this.checkGatheringEquipment(gatheringStat, overallLevel);
        await this.checkGatheringArtifacts(gatheringStat, overallLevel);
        return ObjectiveCompleted;
      }

      if (await this.evaluateCombatGear(charLevel, this.targetMob)) {
        return ObjectiveCompleted;
      }

      logger.warn(
        `Combat gear up attempt ${attempt}/${this.maxRetries} failed`,
      );
    }

    return { complete: true, success: false, reason: 'failed' };
  }

  /**
   * @description Equips the best available wisdom or prospecting gear for each
   * armor/accessory slot
   */
  private async checkGatheringEquipment(
    stat: 'prospecting' | 'wisdom',
    charLevel: number,
  ): Promise<void> {
    const slotMaps: [ItemSlot, ItemSchema[] | undefined][] = [
      ['helmet', this.character.helmetMap?.[stat]],
      ['body_armor', this.character.armorMap?.[stat]],
      ['leg_armor', this.character.legsArmorMap?.[stat]],
      ['boots', this.character.bootsMap?.[stat]],
      ['amulet', this.character.amuletMap?.[stat]],
      ['shield', this.character.shieldMap?.[stat]],
      ['ring1', this.character.ringsMap?.[stat]],
      ['ring2', this.character.ringsMap?.[stat]],
    ];

    // Tracks how many of each item code earlier slots have claimed this pass,
    // so a single-copy item isn't picked for two slots (e.g. both rings).
    const allocated = new Map<string, number>();

    for (const [slot, map] of slotMaps) {
      const best = await this.selectBestStatGear(
        slot,
        map ?? [],
        stat,
        charLevel,
        allocated,
      );

      if (!best) {
        logger.debug(`No ${stat} gear available for ${slot}, leaving as is`);
        continue;
      }

      if (this.character.getCharacterGearIn(slot) === best.code) {
        logger.debug(`Best ${stat} ${slot} (${best.code}) already equipped`);
        continue;
      }

      allocated.set(best.code, (allocated.get(best.code) ?? 0) + 1);

      if (best.fromBank) {
        await this.character.withdrawNow(1, best.code);
        this.bankCache?.remove(best.code, 1);
      }
      logger.debug(`Equipping ${best.code} into ${slot} for ${stat}`);
      await this.character.equipNow(best.code, slot);
    }
  }

  /**
   * @description Picks the item with the highest target-stat value for a slot
   * Returns undefined when nothing usable provides the stat.
   */
  private async selectBestStatGear(
    slot: ItemSlot,
    map: ItemSchema[],
    stat: 'prospecting' | 'wisdom',
    charLevel: number,
    allocated: Map<string, number>,
  ): Promise<{ code: string; fromBank: boolean } | undefined> {
    let best: { code: string; fromBank: boolean; value: number } | undefined;

    for (const item of map) {
      if (item.level > charLevel) {
        continue;
      }

      const statValue =
        item.effects?.find((effect) => effect.code === stat)?.value ?? 0;
      if (best && statValue <= best.value) {
        continue;
      }

      const currentlyEquippedGear =
        this.character.getCharacterGearIn(slot) === item.code;
      let fromBank = false;

      if (!currentlyEquippedGear) {
        let numHeld = this.character.checkQuantityOfItemInInv(item.code);
        if (numHeld === 0) {
          numHeld = await this.character.checkQuantityOfItemInBank(
            item.code,
            this.bankCache,
          );
          fromBank = true;
        }

        const available = numHeld - (allocated.get(item.code) ?? 0);
        if (available <= 0) {
          continue;
        }
      }

      best = { code: item.code, fromBank, value: statValue };
    }

    if (!best) {
      return undefined;
    }
    return { code: best.code, fromBank: best.fromBank };
  }

  /**
   * @description Decides whether gathering gear should target prospecting or
   * wisdom, based on the drop rate of targetResource (prospecting if rate > 1).
   * Falls back to wisdom if no targetResource, on API error, or if the resource
   * or drop cannot be found.
   */
  private async determineGatheringStat(
    targetResource: string | undefined,
  ): Promise<'prospecting' | 'wisdom'> {
    if (!targetResource) {
      return 'wisdom';
    }

    const resources = await getAllResourceInformation({ drop: targetResource });
    if (resources instanceof ApiError) {
      logger.warn(
        `Failed to fetch resource info for ${targetResource}, defaulting to wisdom`,
      );
      return 'wisdom';
    }

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
        `No accessible resource found for ${targetResource}, defaulting to wisdom`,
      );
      return 'wisdom';
    }

    const drop = resource.drops.find((d) => d.code === targetResource);
    if (!drop) {
      logger.warn(
        `${targetResource} not found in resource drops, defaulting to wisdom`,
      );
      return 'wisdom';
    }

    const targetEffect = drop.rate > 1 ? 'prospecting' : 'wisdom';
    logger.info(
      `Drop rate for ${targetResource}: 1/${drop.rate} — targeting ${targetEffect} gear`,
    );
    return targetEffect;
  }

  private async selectForSlotWithResistancePriority(
    gearType: ItemSlot,
    mobResistances: MonsterResistance[],
    charLevel: number,
    allocated: Map<string, number>,
  ): Promise<string | undefined> {
    for (const resistance of mobResistances) {
      const code = await this.selectForSlot(
        gearType,
        resistance.dmgCounterType,
        charLevel,
        allocated,
      );
      if (code) {
        logger.debug(
          `Selected ${gearType} with ${resistance.dmgCounterType} resistance`,
        );
        return code;
      }
    }

    logger.debug(
      `No good ${gearType} gear found for resistance types, trying 'dmg'`,
    );
    return await this.selectForSlot(gearType, 'dmg', charLevel, allocated);
  }

  private async chooseCombatGear(
    charLevel: number,
    targetMob: string,
  ): Promise<Map<ItemSlot, string> | ApiError> {
    const mobInfo = await getMonsterInformation(targetMob);
    if (mobInfo instanceof ApiError) {
      return mobInfo;
    }

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

    // Tracks how many of each item code have already been claimed by earlier
    // slots in this pass, so a single-copy item isn't picked for two slots.
    const allocated = new Map<string, number>();
    const chosen = new Map<ItemSlot, string>();

    for (const attack of mobAttacks) {
      logger.info(
        `Finding best ${attack.counterType} shield against ${attack.value} ${attack.type}`,
      );
      const code = await this.selectForSlot(
        'shield',
        attack.counterType,
        charLevel,
        allocated,
      );
      if (code) {
        chosen.set('shield', code);
        break;
      }
    }

    const weaponCode = await this.selectWeapon(
      mobResistances,
      charLevel,
      allocated,
    );
    if (weaponCode) {
      chosen.set('weapon', weaponCode);
    }

    const gearTypes: ItemSlot[] = [
      'helmet',
      'body_armor',
      'leg_armor',
      'ring1',
      'ring2',
      'amulet',
    ];

    for (const gearType of gearTypes) {
      const code = await this.selectForSlotWithResistancePriority(
        gearType,
        mobResistances,
        charLevel,
        allocated,
      );
      if (code) {
        chosen.set(gearType, code);
      }
    }

    const bootsCode = await this.selectForSlot(
      'boots',
      'hp',
      charLevel,
      allocated,
    );
    if (bootsCode) {
      chosen.set('boots', bootsCode);
    }

    return chosen;
  }

  /**
   * @description Evaluates gear in preparation for a fight
   */
  private async evaluateCombatGear(
    charLevel: number,
    targetMob: string,
  ): Promise<boolean> {
    await this.character.recoverHealth();

    const chosen = await this.chooseCombatGear(charLevel, targetMob);
    if (chosen instanceof ApiError) {
      return this.character.handleErrors(chosen);
    }

    for (const [slot, code] of chosen) {
      if (this.character.getCharacterGearIn(slot) !== code) {
        logger.debug(`Attempting to equip ${code} into ${slot}`);
        await this.character.equipNow(code, slot);
      }
    }

    await this.checkRuneSlot();
    return true;
  }

  async selectCombatLoadout(
    charLevel: number,
    targetMob: string,
    cache?: BankCache,
  ): Promise<Partial<FakeCharacterSchema>> {
    this.bankCache = cache ?? (await BankCache.create(this.character));

    // Simulating against a loadout picked from an unreadable bank would claim
    // the character owns nothing; the current equipment is the honest fallback.
    if (this.bankCache.stale) {
      logger.warn(
        `Could not read the bank, simulating ${targetMob} with current equipment instead`,
      );
      return {};
    }

    const chosen = await this.chooseCombatGear(charLevel, targetMob);
    if (chosen instanceof ApiError) {
      logger.warn(
        `Could not evaluate gear for ${targetMob}, simulating current equipment instead`,
      );
      return {};
    }

    const loadout: Partial<FakeCharacterSchema> = {};
    for (const [slot, code] of chosen) {
      (loadout as Record<string, string>)[`${slot}_slot`] = code;
    }
    return loadout;
  }

  /**
   * @description Proposes the best combat gear the character can assemble from
   * the bank.
   * Note: The loadout is deliberately potion-free. Neither the base schema nor
   * chooseCombatGear supplies a utility, and the sim API defaults an omitted
   * utility quantity to 1, so passing one on would mean the fight sim defaults
   * to having 1 potion which we don't want
   */
  async proposeCombatLoadout(
    charLevel: number,
    targetMob: string,
    cache?: BankCache,
  ): Promise<FakeCharacterSchema> {
    const selected = await this.selectCombatLoadout(
      charLevel,
      targetMob,
      cache,
    );
    const base = this.character.createFakeCharacterSchema(this.character.data);
    return { ...base, ...selected };
  }

  /**
   * @description Equips 100 health potions into the utility 1 slot
   * utility 1 is reserved for health potions
   * @returns
   */
  private async topUpHealthPots(): Promise<ObjectiveResult> {
    if (this.character.data.utility1_slot_quantity <= MinEquippedUtilities) {
      return await this.character.equipUtility('restore', 'utility1');
    }

    return ObjectiveCompleted;
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
   * @description Picks the combat weapon that does the most damage on the mob
   * once its resistances are applied.
   */
  private async selectWeapon(
    mobResistances: MonsterResistance[],
    charLevel: number,
    allocated: Map<string, number>,
  ): Promise<string | undefined> {
    const ranked = this.character.weaponMap['combat']
      .filter(
        (weapon) => weapon.level <= charLevel && weapon.level > charLevel - 15,
      )
      .map((weapon) => ({
        weapon,
        score: scoreWeaponAgainstResistances(weapon, mobResistances),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      logger.info(
        `Best weapon by damage after resistances: ${ranked
          .slice(0, 3)
          .map(({ weapon, score }) => `${weapon.code} (${score.toFixed(1)})`)
          .join(', ')}`,
      );
    }

    const bestWeapon = await this.claimBestAvailable(
      ranked.map(({ weapon }) => weapon),
      'weapon',
      allocated,
    );
    if (bestWeapon === undefined) {
      logger.warn(`Found no good weapon against these resistances`);
      return undefined;
    }

    return bestWeapon.code;
  }

  /**
   * @todo Compare the strengths/weaknesses of the target resource, and find best weapon for that
   * @param activityType
   */
  private async checkGatheringWeapon(
    activityType: WeaponFlavours,
    charLevel: number,
  ): Promise<ObjectiveResult> {
    let wishlistRequested = false;
    const weapons = this.character.weaponMap?.[activityType];
    if (!weapons) {
      logger.warn(
        `No weapons mapped for ${activityType}, skipping weapon check`,
      );
      return ObjectiveFailed;
    }

    for (let ind = weapons.length - 1; ind >= 0; ind--) {
      if (weapons[ind].level <= charLevel) {
        if (weapons[ind].code === this.character.data.weapon_slot) {
          logger.info(`Already have ${weapons[ind].code} equipped`);
          return ObjectiveCompleted;
        }
        logger.debug(`Attempting to equip ${weapons[ind].name} for gathering`);
        if (this.character.checkQuantityOfItemInInv(weapons[ind].code) > 0) {
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else if (
          (await this.character.checkQuantityOfItemInBank(
            weapons[ind].code,
            this.bankCache,
          )) > 0
        ) {
          return await this.character.equipNow(weapons[ind].code, 'weapon');
        } else if (!wishlistRequested) {
          logger.info(`Requesting ${weapons[ind].code} from wishlist`);
          await this.requestIngredientFromWishlist({
            code: weapons[ind].code,
            quantity: 1,
          });
          wishlistRequested = true;
        }
      }
    }
    return ObjectiveFailed;
  }

  /**
   * @description Selects the best prospecting or wisdom artifacts for gathering
   * activities, using the stat resolved by determineGatheringStat.
   */
  private async checkGatheringArtifacts(
    targetEffect: 'prospecting' | 'wisdom',
    charLevel: number,
  ): Promise<void> {
    if (!this.character.artifactsMap) {
      logger.warn('artifactsMap not built, skipping artifact evaluation');
      return;
    }

    const artifactSlots: ItemSlot[] = ['artifact1', 'artifact2', 'artifact3'];
    const artifacts = this.character.artifactsMap[targetEffect] ?? [];

    const candidates = artifacts
      .filter((artifact) => artifact.level <= charLevel)
      .sort(
        (a, b) =>
          effectValueOf(b, targetEffect) - effectValueOf(a, targetEffect) ||
          b.level - a.level,
      );

    const alreadyWearing = new Set<string>();

    for (const slot of artifactSlots) {
      const equippedCode = this.character.getCharacterGearIn(slot);
      const equipped = artifacts.find(
        (artifact) => artifact.code === equippedCode,
      );

      // A slot holding an artifact for the other gathering stat is left alone
      if (equippedCode !== '' && !equipped) {
        logger.debug(
          `${equippedCode} in ${slot} is not a ${targetEffect} artifact. Leaving it`,
        );
        continue;
      }

      const equippedValue = equipped
        ? effectValueOf(equipped, targetEffect)
        : 0;
      let slotFilled = false;

      for (const candidate of candidates) {
        if (effectValueOf(candidate, targetEffect) <= equippedValue) {
          break;
        }

        if (alreadyWearing.has(candidate.code)) {
          continue;
        }

        if (this.character.getEquippedSlot(candidate.code)) {
          logger.debug(
            `${candidate.code} already equipped elsewhere. Skipping`,
          );
          continue;
        }

        const inInv = this.character.checkQuantityOfItemInInv(candidate.code);
        if (inInv === 0) {
          const inBank = await this.character.checkQuantityOfItemInBank(
            candidate.code,
            this.bankCache,
          );
          if (inBank === 0) {
            continue;
          }

          await this.character.withdrawNow(1, candidate.code);
          this.bankCache?.remove(candidate.code, 1);
        }

        logger.debug(
          `Equipping ${candidate.code} into ${slot} for ${targetEffect}`,
        );
        await this.character.equipNow(candidate.code, slot);
        alreadyWearing.add(candidate.code);
        slotFilled = true;
        break;
      }

      if (!slotFilled) {
        logger.debug(
          `No ${targetEffect} artifact upgrade available for ${slot}`,
        );
      }
    }
  }

  private async selectForSlot(
    gearType: ItemSlot,
    targetEffect: GearEffects,
    charLevel: number,
    allocated: Map<string, number>,
  ): Promise<string | undefined> {
    let gearMap: ItemSchema[];
    switch (gearType) {
      case 'amulet':
        gearMap = this.character.amuletMap[targetEffect];
        break;
      case 'body_armor':
        gearMap = this.character.armorMap[targetEffect];
        break;
      case 'boots':
        gearMap = this.character.bootsMap[targetEffect];
        break;
      case 'helmet':
        gearMap = this.character.helmetMap[targetEffect];
        break;
      case 'leg_armor':
        gearMap = this.character.legsArmorMap[targetEffect];
        break;
      case 'ring1':
        gearMap = this.character.ringsMap[targetEffect];
        break;
      case 'ring2':
        gearMap = this.character.ringsMap[targetEffect];
        break;
      case 'shield':
        gearMap = this.character.shieldMap[targetEffect];
        break;
      default:
        logger.warn(
          `Checking gear of type ${gearType} is unavailable right now`,
        );
        return undefined;
    }

    const bestGear = await this.identifyBestGear(
      gearMap,
      targetEffect,
      charLevel,
      gearType,
      allocated,
    );
    if (bestGear === undefined) {
      logger.debug(`Found no good ${gearType} gear for ${targetEffect}`);
      return undefined;
    }

    return bestGear.code;
  }

  /**
   * @description Iterates through all the gear within 10 levels of the character to find the one that suits best
   * @todo Make this work better. I've commented out the code that finds the best weapon because it wasn't working
   * as well as I'd like. Now it just gets the first, highest level weapon we have in inventory or bank and sets that
   * as the best, regardless of target mob strengths/weaknesses.
   * @param gearMap
   * @param targetEffect
   * @param charLevel
   * @returns
   */
  /**
   * @description Walks candidates in preference order and takes the first one
   * the character can actually lay hands on, wishlisting at most one of the
   * better ones it had to skip.
   * @param candidates the gear that suits the slot, best first
   */
  private async claimBestAvailable(
    candidates: ItemSchema[],
    gearSlot: ItemSlot,
    allocated: Map<string, number>,
  ): Promise<ItemSchema | undefined> {
    let wishlistRequested = false;

    for (const candidate of candidates) {
      if (this.character.getCharacterGearIn(gearSlot) === candidate.code) {
        logger.info(`${candidate.code} already equipped`);
        return candidate;
      }

      let numHeld = this.character.checkQuantityOfItemInInv(candidate.code);
      if (numHeld === 0) {
        numHeld = await this.character.checkQuantityOfItemInBank(
          candidate.code,
          this.bankCache,
        );
      }

      if (numHeld - (allocated.get(candidate.code) ?? 0) > 0) {
        allocated.set(candidate.code, (allocated.get(candidate.code) ?? 0) + 1);
        return candidate;
      }

      if (!wishlistRequested) {
        logger.info(
          `Requesting ${candidate.code} from wishlist for ${gearSlot}`,
        );
        await this.requestIngredientFromWishlist({
          code: candidate.code,
          quantity: 1,
        });
        wishlistRequested = true;
      } else {
        logger.debug(
          `Already requested a wishlist item for ${gearSlot}, skipping ${candidate.code}`,
        );
      }
    }

    return undefined;
  }

  private async identifyBestGear(
    gearMap: ItemSchema[],
    targetEffect: GearEffects,
    charLevel: number,
    gearSlot: ItemSlot,
    allocated: Map<string, number>,
  ): Promise<ItemSchema> {
    const candidates = gearMap
      .filter((gear) => gear.level <= charLevel && gear.level > charLevel - 15)
      .filter((gear) =>
        gear.effects?.some((effect) => effect.code === targetEffect),
      )
      .reverse();

    return await this.claimBestAvailable(candidates, gearSlot, allocated);
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
      // ToDo: don't hardcode the cost of the rune. store this info in memory so no api calls needed
      if (this.character.data.gold < 10000) {
        logger.debug(
          `${this.character.data.name} cannot afford 'healing_rune'`,
        );
        return false;
      }

      if ((await this.character.tradeWithNpcNow('buy', 1, runeName)).success) {
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
