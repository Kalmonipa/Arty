import { AttackType, ResistanceType } from './ItemData.js';

export type MonsterAttack = {
  type: AttackType;
  counterType: ResistanceType;
  value: number;
};

export type MonsterResistance = {
  type: ResistanceType;
  counterType: AttackType;
  value: number;
};
