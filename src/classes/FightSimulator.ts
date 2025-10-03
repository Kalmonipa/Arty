import { getMonsterInformation } from '../api_calls/Monsters.js';
import { TurnsDetails } from '../types/FightData.js';
import { CharacterSchema, MonsterSchema } from '../types/types.js';
import { CRITICAL_MODIFIER, logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @description Simulates fights against the target mob. Can take in mock schemas to decide what gear we should equip
 * @todo
 * - Factor in health potions
 * - Factor in other potions/utilities
 * - Factor in initiative to decide turn order
 * @returns true if the sim was a win, false if it was a loss
 */
export class FightSimulator extends Objective {
  mockCharacter: CharacterSchema;
  targetMobCode?: string;
  targetMobSchema?: MonsterSchema;
  iterations: number;
  debugLogs: boolean = true;

  constructor(
    character: Character,
    mockCharacter: CharacterSchema,
    targetMobName?: string,
    targetMobSchema?: MonsterSchema,
    iterations?: number,
    debugLogs?: boolean,
  ) {
    super(
      character,
      `fight_sim_${targetMobName || targetMobSchema.code}`,
      'not_started',
    );
    this.mockCharacter = mockCharacter;
    this.targetMobCode = targetMobName;
    this.targetMobSchema = targetMobSchema;
    this.iterations = iterations !== undefined ? iterations : 10;
    this.debugLogs = debugLogs;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    if (!this.targetMobCode && !this.targetMobSchema) {
      logger.error(
        `One of targetMobName or targetMobSchema must be passed into the fightSimulator`,
      );
      return false;
    }

    return true;
  }

  async run(): Promise<boolean> {
    let fightResult = false;
    let numTurns = 0;
    const mobName = this.targetMobCode || this.targetMobSchema.code;
    // Get mob info
    // Initiative should factor in to decide turn order
    // Iterate through the fight turn by turn, calculating damage taken and given
    // Calculate when health pots will be used
    // Return true if fight is a win (greater than 90% win rate), otherwise false

    let mob: MonsterSchema;
    if (this.targetMobCode) {
      logger.debug(`Getting info on ${mobName}`);
      const mobInfo = await getMonsterInformation(this.targetMobCode);
      if (mobInfo instanceof ApiError) {
        return this.character.handleErrors(mobInfo);
      }

      mob = mobInfo.data;
    } else {
      mob = this.targetMobSchema;
    }

    const mobAttacks: TurnsDetails = [];
    if (mob.attack_air > 0) {
      mobAttacks.push({
        attackType: 'air',
        dmg: this.calculateMobDamage(mob.attack_air),
        criticalChance: mob.critical_strike,
        victimResistance: this.mockCharacter.res_air,
      });
    }
    if (mob.attack_earth > 0) {
      mobAttacks.push({
        attackType: 'earth',
        dmg: this.calculateMobDamage(mob.attack_earth),
        criticalChance: mob.critical_strike,
        victimResistance: this.mockCharacter.res_earth,
      });
    }
    if (mob.attack_fire > 0) {
      mobAttacks.push({
        attackType: 'fire',
        dmg: this.calculateMobDamage(mob.attack_fire),
        criticalChance: mob.critical_strike,
        victimResistance: this.mockCharacter.res_fire,
      });
    }
    if (mob.attack_water > 0) {
      mobAttacks.push({
        attackType: 'water',
        dmg: this.calculateMobDamage(mob.attack_water),
        criticalChance: mob.critical_strike,
        victimResistance: this.mockCharacter.res_water,
      });
    }
    if (this.debugLogs) {
      for (const attack of mobAttacks) {
        logger.debug(
          `${mob.name} can do ${attack.dmg} ${attack.attackType} damage`,
        );
      }
    }

    const charAttacks: TurnsDetails = [];
    // Round(Attack * Round(Damage * 0.01))
    if (this.mockCharacter.attack_air > 0) {
      const dmg = this.calculatePlayerDamage(
        this.mockCharacter.attack_air,
        this.mockCharacter.dmg_air,
        this.mockCharacter.dmg,
      );
      charAttacks.push({
        attackType: 'air',
        dmg: dmg,
        criticalChance: this.mockCharacter.critical_strike,
        victimResistance: mob.res_air,
      });
    }
    if (this.mockCharacter.attack_earth > 0) {
      const dmg = this.calculatePlayerDamage(
        this.mockCharacter.attack_earth,
        this.mockCharacter.dmg_earth,
        this.mockCharacter.dmg,
      );
      charAttacks.push({
        attackType: 'earth',
        dmg: dmg,
        criticalChance: this.mockCharacter.critical_strike,
        victimResistance: mob.res_earth,
      });
    }
    if (this.mockCharacter.attack_fire > 0) {
      const dmg = this.calculatePlayerDamage(
        this.mockCharacter.attack_fire,
        this.mockCharacter.dmg_fire,
        this.mockCharacter.dmg,
      );
      charAttacks.push({
        attackType: 'fire',
        dmg: dmg,
        criticalChance: this.mockCharacter.critical_strike,
        victimResistance: mob.res_fire,
      });
    }
    if (this.mockCharacter.attack_water > 0) {
      const dmg = this.calculatePlayerDamage(
        this.mockCharacter.attack_water,
        this.mockCharacter.dmg_water,
        this.mockCharacter.dmg,
      );
      charAttacks.push({
        attackType: 'water',
        dmg: dmg,
        criticalChance: this.mockCharacter.critical_strike,
        victimResistance: mob.res_water,
      });
    }
    if (this.debugLogs) {
      for (const attack of charAttacks) {
        logger.debug(
          `${this.mockCharacter.name} can do ${attack.dmg} ${attack.attackType} damage`,
        );
      }
    }

    let fightContinues = true;
    while (fightContinues) {
      if (this.debugLogs) {
        logger.debug(`Char hp: ${this.mockCharacter.hp}; Mob hp: ${mob.hp}`);
      }

      // Player attacks
      if (this.mockCharacter.hp <= 0) {
        logger.warn(
          `Fight sim lost after ${numTurns} turns. ${this.mockCharacter.name} has reached 0 hp`,
        );
        fightContinues = false;
        fightResult = false;
        break;
      } else if (mob.hp <= 0) {
        logger.warn(
          `Fight sim won after ${numTurns} turns. ${mob.name} has reached 0 hp`,
        );
        fightContinues = false;
        fightResult = true;
        break;
      }

      // Characters turn
      mob.hp = this.turn(this.mockCharacter.name, charAttacks, mob.hp, true);

      // Mobs turn
      this.mockCharacter.hp = this.turn(
        mob.name,
        mobAttacks,
        this.mockCharacter.hp,
        true,
      );

      numTurns++;
    }

    return fightResult;
  }

  /**
   * @description simulates the turn
   * @param attacker the attacking entity (either character or mob)
   * @param attacks an array of the attacks to perform. Will be multiple if the attacker uses multiple elements
   * @param victimHealth the targets health
   * @param fightSimDebugLogs true to display logs for each turn
   * @returns the health of the target after the attacks
   */
  private turn(
    attacker: string,
    attacks: TurnsDetails,
    victimHealth: number,
    fightSimDebugLogs?: boolean,
  ): number {
    let health = victimHealth;
    for (const attack of attacks) {
      let dmg = attack.dmg;

      // Decide if it's a critical hit
      const randomRoll = Math.random() * 100;
      if (randomRoll <= attack.criticalChance) {
        dmg = dmg * (1 + CRITICAL_MODIFIER);
      }

      // Remove resistances to the damage
      dmg = Math.round(dmg - attack.victimResistance * 0.01);

      health = victimHealth - dmg;
      if (fightSimDebugLogs === true) {
        logger.debug(`${attacker} did ${dmg} ${attack.attackType} damage`);
      }
    }
    return health;
  }

  /**
   * Calculates the damage that a mob will do each turn
   * @param baseAttack The base damage that the mob does
   * @param elementalDmg The elemental multiplier
   * @param criticalStrike The percentage (0-100) chance of a critical strike occurring
   * @returns the damage value
   */
  private calculateMobDamage(baseAttack: number): number {
    return Math.round(baseAttack + baseAttack * 0.01);
  }

  /**
   * Calculates the damage that the player will do each turn
   * @param baseAttack Base attack that the player does
   * @param elementalDmg Elemental multiplier
   * @param dmg Damage multiplier
   * @param criticalStrike The percentage (0-100) chance of a critical strike occurring
   * @returns The damage value
   */
  private calculatePlayerDamage(
    baseAttack: number,
    elementalDmg: number,
    damage: number,
  ): number {
    return Math.round(baseAttack + baseAttack * (elementalDmg + damage) * 0.01);
  }
}
