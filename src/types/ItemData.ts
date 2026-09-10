import { GatheringSkill } from './types.js';

export type ConsumableEffects = 'heal' | 'teleport';

export type GearEffects =
  | 'critical_strike'
  | 'dmg'
  | 'heal'
  | 'hp'
  | 'initiative'
  | 'prospecting'
  // Decides who the monster attacks in a party fight, so it is the stat a tank
  // is really buying. buildListOf buckets by whatever codes items carry, so the
  // threat and initiative maps already exist — this only names them.
  | 'threat'
  | 'wisdom'
  | ResistanceType
  | AttackType
  | DamageType;

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
  | 'restore'
  | 'splash_restore';

export type WeaponFlavours = GatheringSkill | 'combat';

export type ResistanceType = 'res_fire' | 'res_earth' | 'res_water' | 'res_air';

export type AttackType =
  | 'attack_fire'
  | 'attack_earth'
  | 'attack_water'
  | 'attack_air';

export type DamageType = 'dmg_fire' | 'dmg_earth' | 'dmg_water' | 'dmg_air';
