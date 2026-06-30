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

/**
 * Max default number of slots
 */
export const MaxInventorySlots = 20;
/**
 * Maximum number of potions that can be equipped
 */
export const MaxEquippedUtilities = 100;
/**
 * Minimum number of potions to equip
 */
export const MinEquippedUtilities = 20;
/**
 * Desired number of food in inventory
 */
export const DesiredFoodCount = 50;
/**
 *  Minimum food in inventory when going into a fight
 */
export const MinFood = 15;

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');

export const FishMerchant = 'fish_merchant';
export const GemstoneMerchant = 'gemstone_merchant';
export const HerbalMerchant = 'herbal_merchant';
export const NomadicMerchant = 'nomadic_merchant';
export const TimberMerchant = 'timber_merchant';

// ToDo: do the remaining slots
export const WeaponSlot = 'weapon_slot';
export const RuneSlot = 'rune_slot';
export const ShieldSlot = 'shield_slot';
export const BagSlot = 'bag_slot';
export const HelmetSlot = 'helmet_slot';
export const BodyArmorSlot = 'body_armor_slot';
