import { Character } from '../character/character.js';
import { BossFightRole } from '../fightBosses/bossFight.types.js';
import { WeaponFlavours } from '../types/ItemData.js';

export type EvaluateGearParams = {
  character: Character;
  activityType: WeaponFlavours;
  targetMob?: string;
  targetResource?: string;
  bossFightRole?: BossFightRole;
};
