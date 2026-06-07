import { Role } from './types/CharacterData.js';
import { ItemSlot } from './types/types.js';
import { getEnv } from './utils.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

/**
 * My ArtifactsMMO character names
 */
export const AllCharNames = [
  'LongLegLarry',
  'JumpyJimmy',
  'ZippyZoe',
  'TimidTom',
  'BouncyBella',
];

export const CharName = getEnv('CHARACTER_NAME');
export const CharRole = getEnv('ROLE').toLowerCase() as Role;
export const MAX_COMBAT_LEVEL = 50;
export const MAX_SKILL_LEVEL = 50;
export const CRITICAL_MODIFIER = 0.5;

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');

// ToDo: do the remaining merchants
export const NomadicMerchant = 'nomadic_merchant'
export const FishMerchant = 'fish_merchant'

// ToDo: do the remaining slots
export const WeaponSlot = 'weapon_slot'
export const RuneSlot = 'rune_slot'
export const ShieldSlot = 'shield_slot'
export const BagSlot = 'bag_slot'
