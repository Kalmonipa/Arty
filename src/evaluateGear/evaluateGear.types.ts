import { Character } from '../character/character.js';
import { BossFightRole } from '../fightBosses/bossFight.types.js';
import { WeaponFlavours } from '../types/ItemData.js';

export type EvaluateGearParams = {
  character: Character;
  activityType: WeaponFlavours;
  targetMob?: string;
  targetResource?: string;
  bossFightRole?: BossFightRole;
  /** Which of the fight plan's loadout variants to gear for */
  gearVariant?: string;
  /**
   * Whether restore potions count as part of the loadout, both when equipping
   * and when proposing one to simulate. Defaults to on for a boss fight role
   * and off for an ordinary fight.
   */
  usePotions?: boolean;
};

/** A potion the character can field, and how many of it it can muster */
export type PotionStock = {
  code: string;
  quantity: number;
};
