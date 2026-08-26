import { UtilityEffects } from './types/ItemData.js';

/**
 * Achievements
 */
export const GourmetChef = 'gourmet_chef';
export const CleanTheLab = 'clean_the_lab';
export const SecureTheIsland = 'secure_the_island';

/**
 * Effects
 */
export const Antidote = 'antipoison' as const satisfies UtilityEffects;
export const BoostDmgAir = 'boost_dmg_air' as const satisfies UtilityEffects;
export const BoostDmgEarth =
  'boost_dmg_earth' as const satisfies UtilityEffects;
export const BoostDmgFire = 'boost_dmg_fire' as const satisfies UtilityEffects;
export const BoostDmgWater =
  'boost_dmg_water' as const satisfies UtilityEffects;
export const BoostHp = 'boost_hp' as const satisfies UtilityEffects;
export const BoostResAir = 'boost_res_air' as const satisfies UtilityEffects;
export const BoostResEarth =
  'boost_res_earth' as const satisfies UtilityEffects;
export const BoostResFire = 'boost_res_fire' as const satisfies UtilityEffects;
export const BoostResWater =
  'boost_res_water' as const satisfies UtilityEffects;
export const Restore = 'restore' as const satisfies UtilityEffects;
export const SplashRestore = 'splash_restore' as const satisfies UtilityEffects;

/**
 * @description Items
 */
export const TasksCoin = 'tasks_coin';
export const Algae = 'algae';
export const Sap = 'sap';
export const HealthSplashPotion = 'health_splash_potion';

/**
 * @description Map Areas
 */
export const SandWhisperIsle = 'Sandwhisper Isle';
export const SandwhisperMine = 'Sandwhisper Mine';

/**
 * @description Layers
 */
export const Overworld = 'overworld';
export const Underground = 'underground';
export const Interior = 'interior';

/**
 * NPCs
 */
export const FishMerchant = 'fish_merchant';
export const GemstoneMerchant = 'gemstone_merchant';
export const HerbalMerchant = 'herbal_merchant';
export const NomadicMerchant = 'nomadic_merchant';
export const TimberMerchant = 'timber_merchant';

/**
 * Equipment Slots
 */
export const WeaponSlot = 'weapon_slot';
export const RuneSlot = 'rune_slot';
export const ShieldSlot = 'shield_slot';
export const BagSlot = 'bag_slot';
export const HelmetSlot = 'helmet_slot';
export const BodyArmorSlot = 'body_armor_slot';
export const LegArmorSlot = 'leg_armor_slot';
export const BootsSlot = 'boots_slot';
export const Ring1Slot = 'ring1_slot';
export const Ring2Slot = 'ring2_slot';
export const AmuletSlot = 'amulet_slot';
export const Artifact1Slot = 'artifact1_slot';
export const Artifact2Slot = 'artifact2_slot';
export const Artifact3Slot = 'artifact3_slot';
export const Utility1Slot = 'utility1_slot';
export const Utility2Slot = 'utility2_slot';

/**
 * Skills
 */
export const Alchemy = 'alchemy';
export const Cooking = 'cooking';
export const Fishing = 'fishing';
export const Gearcrafting = 'gearcrafting';
export const Jewelrycrafting = 'jewelrycrafting';
export const Mining = 'mining';
export const Weaponcrafting = 'weaponcrafting';
export const Woodcutting = 'woodcutting';
