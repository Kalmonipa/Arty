import { AttackType, DamageType, ResistanceType } from './ItemData.js';

export type MonsterAttack = {
  type: AttackType;
  counterType: ResistanceType;
  value: number;
};

export type MonsterResistance = {
  type: ResistanceType;
  atkCounterType: AttackType;
  dmgCounterType: DamageType;
  value: number;
};
