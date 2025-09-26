import { GatheringSkill } from './types.js';

export type ConsumableEffects = 'heal' | 'teleport_x' | 'teleport_y';

export type GearEffects =
  | 'critical_strike'
  | 'dmg'
  | 'heal'
  | 'hp'
  | 'prospecting'
  | 'wisdom'
  | ResistanceType
  | AttackType;

export type UtilityEffects =
  | 'antipoison'
  | 'boost_dmg_air'
  | 'boost_dmg_earth'
  | 'boost_dmg_fire'
  | 'boost_dmg_water'
  | 'boost_hp'
  | 'boost_res_air'
  | 'boost_res_earth'
  | 'boost_res_fire'
  | 'boost_res_water'
  | 'restore';

export type WeaponFlavours = GatheringSkill | 'combat';

export type ResistanceType = 'res_fire' | 'res_earth' | 'res_water' | 'res_air';

export type AttackType =
  | 'attack_fire'
  | 'attack_earth'
  | 'attack_water'
  | 'attack_air';
