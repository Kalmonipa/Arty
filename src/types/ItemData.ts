import { GatheringSkill } from './types';

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
