import { jest } from '@jest/globals';
import { ApiError } from '../../src/classes/Error.js';
import {
  CharacterSchema,
  DataPageMapSchema,
  DataPageMonsterSchema,
  DataPageResourceSchema,
  ItemSchema,
  SkillResponseSchema,
} from '../../src/types/types.js';

// Mock data based on OpenAPI spec
export const mockCharacterData: CharacterSchema = {
  name: 'TestCharacter',
  account: 'TestAccount',
  skin: 'men1',
  level: 10,
  xp: 1489,
  max_xp: 2100,
  gold: 1000,
  speed: 100,
  mining_level: 13,
  mining_xp: 2071,
  mining_max_xp: 3300,
  woodcutting_level: 6,
  woodcutting_xp: 649,
  woodcutting_max_xp: 950,
  fishing_level: 1,
  fishing_xp: 78,
  fishing_max_xp: 150,
  weaponcrafting_level: 7,
  weaponcrafting_xp: 229,
  weaponcrafting_max_xp: 1200,
  gearcrafting_level: 1,
  gearcrafting_xp: 0,
  gearcrafting_max_xp: 150,
  jewelrycrafting_level: 1,
  jewelrycrafting_xp: 0,
  jewelrycrafting_max_xp: 150,
  cooking_level: 1,
  cooking_xp: 0,
  cooking_max_xp: 150,
  alchemy_level: 1,
  alchemy_xp: 0,
  alchemy_max_xp: 150,
  hp: 1,
  max_hp: 245,
  haste: 0,
  critical_strike: 35,
  wisdom: 10,
  prospecting: 0,
  initiative: 100,
  threat: 0,
  attack_fire: 0,
  attack_earth: 0,
  attack_water: 16,
  attack_air: 0,
  dmg: 9,
  dmg_fire: 0,
  dmg_earth: 0,
  dmg_water: 5,
  dmg_air: 5,
  res_fire: 2,
  res_earth: 2,
  res_water: 2,
  res_air: 2,
  effects: [
    {
      code: 'restore',
      value: 30,
    },
  ],
  x: 0,
  y: 0,
  layer: 'overworld',
  map_id: 91,
  cooldown: 200,
  cooldown_expiration: '2025-10-01T16:52:35.196Z',
  weapon_slot: 'water_bow',
  rune_slot: '',
  shield_slot: 'wooden_shield',
  helmet_slot: 'copper_helmet',
  body_armor_slot: 'feather_coat',
  leg_armor_slot: 'copper_legs_armor',
  boots_slot: 'copper_boots',
  ring1_slot: 'copper_ring',
  ring2_slot: 'copper_ring',
  amulet_slot: '',
  artifact1_slot: '',
  artifact2_slot: '',
  artifact3_slot: '',
  utility1_slot: 'small_health_potion',
  utility1_slot_quantity: 48,
  utility2_slot: '',
  utility2_slot_quantity: 0,
  bag_slot: '',
  task: 'red_slime',
  task_type: 'monsters',
  task_progress: 0,
  task_total: 368,
  inventory_max_items: 118,
  inventory: [
    {
      slot: 1,
      code: 'apple',
      quantity: 45,
    },
    {
      slot: 2,
      code: '',
      quantity: 0,
    },
    {
      slot: 3,
      code: '',
      quantity: 0,
    },
    {
      slot: 4,
      code: '',
      quantity: 0,
    },
    {
      slot: 5,
      code: '',
      quantity: 0,
    },
    {
      slot: 6,
      code: '',
      quantity: 0,
    },
    {
      slot: 7,
      code: '',
      quantity: 0,
    },
    {
      slot: 8,
      code: '',
      quantity: 0,
    },
    {
      slot: 9,
      code: '',
      quantity: 0,
    },
    {
      slot: 10,
      code: '',
      quantity: 0,
    },
    {
      slot: 11,
      code: '',
      quantity: 0,
    },
    {
      slot: 12,
      code: '',
      quantity: 0,
    },
    {
      slot: 13,
      code: '',
      quantity: 0,
    },
    {
      slot: 14,
      code: '',
      quantity: 0,
    },
    {
      slot: 15,
      code: '',
      quantity: 0,
    },
    {
      slot: 16,
      code: '',
      quantity: 0,
    },
    {
      slot: 17,
      code: '',
      quantity: 0,
    },
    {
      slot: 18,
      code: '',
      quantity: 0,
    },
    {
      slot: 19,
      code: '',
      quantity: 0,
    },
    {
      slot: 20,
      code: '',
      quantity: 0,
    },
  ],
};

export const mockItemData: ItemSchema = {
  code: 'iron_ore',
  name: 'Iron Ore',
  level: 1,
  type: 'resource',
  subtype: 'mining',
  description: 'A common ore used for crafting',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [],
};

export const mockResourceData: DataPageResourceSchema = {
  data: [
    {
      code: 'iron_ore',
      name: 'Iron Ore',
      skill: 'mining',
      level: 1,
      drops: [
        {
          code: 'iron_ore',
          rate: 1,
          min_quantity: 1,
          max_quantity: 1,
        },
      ],
    },
  ],
  total: 1,
  page: 1,
  size: 50,
};

export const mockMapData: DataPageMapSchema = {
  data: [
    {
      map_id: 1,
      name: 'Iron Mine',
      skin: 'mine',
      x: 150,
      y: 150,
      layer: 'overworld',
      access: {
        type: 'standard',
      },
      interactions: {},
    },
  ],
  total: 1,
  page: 1,
  size: 50,
};

export const mockMonsterData: DataPageMonsterSchema = {
  data: [
    {
      name: 'Flying Snake',
      code: 'flying_snake',
      level: 12,
      type: 'normal',
      hp: 360,
      attack_fire: 0,
      attack_earth: 0,
      attack_water: 0,
      attack_air: 34,
      res_fire: -20,
      res_earth: 0,
      res_water: -20,
      res_air: 40,
      critical_strike: 5,
      initiative: 125,
      effects: [],
      min_gold: 0,
      max_gold: 8,
      drops: [
        {
          code: 'flying_wing',
          rate: 12,
          min_quantity: 1,
          max_quantity: 2,
        },
        {
          code: 'snake_hide',
          rate: 12,
          min_quantity: 1,
          max_quantity: 3,
        },
        {
          code: 'forest_ring',
          rate: 200,
          min_quantity: 1,
          max_quantity: 1,
        },
      ],
    },
  ],
  total: 1,
  page: 1,
  size: 50,
};

export const mockGatherResponse: SkillResponseSchema = {
  data: {
    character: {
      ...mockCharacterData,
      inventory: [
        {
          slot: 0,
          code: 'iron_ore',
          quantity: 1,
        },
      ],
    },
    cooldown: {
      remaining_seconds: 0,
      total_seconds: 5,
      started_at: '2025-10-01T16:51:00.196Z',
      expiration: '2025-10-01T16:52:35.196Z',
      reason: 'fight',
    },
    details: {
      xp: 10,
      items: [],
    },
  },
};

// Mock implementations with proper typing
export const mockActionGather = jest.fn() as jest.MockedFunction<
  typeof import('../../src/api_calls/Actions.js').actionGather
>;
export const mockGetItemInformation = jest.fn() as jest.MockedFunction<
  typeof import('../../src/api_calls/Items.js').getItemInformation
>;
export const mockGetMaps = jest.fn() as jest.MockedFunction<
  typeof import('../../src/api_calls/Maps.js').getMaps
>;
export const mockGetAllMonsterInformation = jest.fn() as jest.MockedFunction<
  typeof import('../../src/api_calls/Monsters.js').getAllMonsterInformation
>;
export const mockGetResourceInformation = jest.fn() as jest.MockedFunction<
  typeof import('../../src/api_calls/Resources.js').getResourceInformation
>;

// Default mock implementations
mockActionGather.mockResolvedValue(mockGatherResponse);
mockGetItemInformation.mockResolvedValue(mockItemData);
mockGetMaps.mockResolvedValue(mockMapData);
mockGetAllMonsterInformation.mockResolvedValue(mockMonsterData);
mockGetResourceInformation.mockResolvedValue(mockResourceData);

// Helper functions to create error responses
export const createApiError = (code: number, message: string): ApiError => {
  return new ApiError({ code, message });
};

// Helper functions to reset all mocks
export const resetAllMocks = () => {
  mockActionGather.mockReset();
  mockGetItemInformation.mockReset();
  mockGetMaps.mockReset();
  mockGetAllMonsterInformation.mockReset();
  mockGetResourceInformation.mockReset();

  // Reset to default implementations
  mockActionGather.mockResolvedValue(mockGatherResponse);
  mockGetItemInformation.mockResolvedValue(mockItemData);
  mockGetMaps.mockResolvedValue(mockMapData);
  mockGetAllMonsterInformation.mockResolvedValue(mockMonsterData);
  mockGetResourceInformation.mockResolvedValue(mockResourceData);
};
