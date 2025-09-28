import { getMonsterInformation } from '../api_calls/Monsters.js';
import { AttackTurns } from '../types/FightData.js';
import { CharacterSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

export class FightSimulator extends Objective {
  mockCharacter: CharacterSchema;
  targetMob: string;
  iterations: number;
  debugLogs: boolean = true;

  constructor(
    character: Character,
    mockCharacter: CharacterSchema,
    targetMob: string,
    iterations?: number,
    debugLogs?: boolean,
  ) {
    super(character, `fight_sim_${targetMob}`, 'not_started');
    this.mockCharacter = mockCharacter;
    this.targetMob = targetMob;
    this.iterations = iterations !== undefined ? iterations : 10;
    this.debugLogs = debugLogs;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    let fightResult = false;
    let numTurns = 0;
    // Get mob info
    // Initiative should factor in to decide turn order
    // Iterate through the fight turn by turn, calculating damage taken and given
    // Calculate when health pots will be used
    // Return true if fight is a win (greater than 90% win rate), otherwise false

    logger.debug(`Getting info on ${this.targetMob}`);
    const mobInfo = await getMonsterInformation(this.targetMob);
    if (mobInfo instanceof ApiError) {
      return this.character.handleErrors(mobInfo);
    }

    const mob = mobInfo.data;

    const mobAttacks: AttackTurns = [];
    if (mob.attack_air > 0) {
      mobAttacks.push({ attackType: 'air', dmg: mob.attack_air });
    }
    if (mob.attack_earth > 0) {
      mobAttacks.push({ attackType: 'earth', dmg: mob.attack_earth });
    }
    if (mob.attack_fire > 0) {
      mobAttacks.push({ attackType: 'fire', dmg: mob.attack_fire });
    }
    if (mob.attack_water > 0) {
      mobAttacks.push({ attackType: 'water', dmg: mob.attack_water });
    }
    if (this.debugLogs) {
      for (const attack of mobAttacks) {
        logger.debug(
          `${mob.name} can do ${attack.dmg} ${attack.attackType} damage`,
        );
      }
    }

    const charAttacks: AttackTurns = [];
    // Round(Attack * Round(Damage * 0.01))
    if (this.mockCharacter.attack_air > 0) {
      const dmg = this.calculateDamage(
        this.mockCharacter.attack_air,
        this.mockCharacter.dmg_air,
        this.mockCharacter.dmg,
      );
      charAttacks.push({ attackType: 'air', dmg: dmg });
    }
    if (this.mockCharacter.attack_earth > 0) {
      const dmg = this.calculateDamage(
        this.mockCharacter.attack_earth,
        this.mockCharacter.dmg_earth,
        this.mockCharacter.dmg,
      );
      charAttacks.push({ attackType: 'earth', dmg: dmg });
    }
    if (this.mockCharacter.attack_fire > 0) {
      const dmg = this.calculateDamage(
        this.mockCharacter.attack_fire,
        this.mockCharacter.dmg_fire,
        this.mockCharacter.dmg,
      );
      charAttacks.push({ attackType: 'fire', dmg: dmg });
    }
    if (this.mockCharacter.attack_water > 0) {
      const dmg = this.calculateDamage(
        this.mockCharacter.attack_water,
        this.mockCharacter.dmg_water,
        this.mockCharacter.dmg,
      );
      charAttacks.push({ attackType: 'water', dmg: dmg });
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

  turn(
    attacker: string,
    attacks: AttackTurns,
    victimHealth: number,
    fightSimDebugLogs?: boolean,
  ): number {
    let health = victimHealth;
    for (const attack of attacks) {
      health = victimHealth - attack.dmg;
      if (fightSimDebugLogs === true) {
        logger.debug(
          `${attacker} did ${attack.dmg} ${attack.attackType} damage`,
        );
      }
    }
    return health;
  }

  calculateDamage(baseAttack: number, elementalDmg: number, dmg: number) {
    return Math.round(baseAttack + baseAttack * (elementalDmg + dmg) * 0.01);
  }
}
