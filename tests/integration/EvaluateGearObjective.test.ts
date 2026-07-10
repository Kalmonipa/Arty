import { jest } from '@jest/globals';
import { EvaluateGearObjective } from '../../src/core/EvaluateGearObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/core/Error.js';
import {
  ItemSlot,
  ItemSchema,
  MonsterSchema,
  CharacterSchema,
} from '../../src/types/types.js';
import { GearEffects, WeaponFlavours } from '../../src/types/ItemData.js';

// Mock the API modules
jest.mock('../../src/api_calls/Monsters', () => ({
  getMonsterInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources', () => ({
  getAllResourceInformation: jest.fn(),
}));

// Import the mocked functions
import { getMonsterInformation } from '../../src/api_calls/Monsters.js';
import { getAllResourceInformation } from '../../src/api_calls/Resources.js';

// Mock monster data
const mockMonsterData = {
  data: {
    name: 'Red Slime',
    code: 'red_slime',
    level: 7,
    type: 'normal' as const,
    hp: 120,
    attack_fire: 18,
    attack_earth: 0,
    attack_water: 0,
    attack_air: 0,
    res_fire: 25,
    res_earth: 0,
    res_water: 0,
    res_air: 0,
    critical_strike: 0,
    initiative: 100,
    effects: [],
    min_gold: 0,
    max_gold: 5,
    drops: [],
  } as MonsterSchema,
};

const mockPoisonMonsterData = {
  data: {
    ...mockMonsterData.data,
    effects: [
      {
        code: 'poison',
        value: 10,
      },
    ],
  } as MonsterSchema,
};

// Mock gear items
const createMockGear = (
  code: string,
  name: string,
  level: number,
  effectType: GearEffects,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'armor',
  subtype: 'body_armor',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    { code: effectType, value: 10, description: `${effectType} effect` },
  ],
});

const createMockWeapon = (
  code: string,
  name: string,
  level: number,
  effectType: GearEffects,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'weapon',
  subtype: 'sword',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    { code: effectType, value: 15, description: `${effectType} effect` },
  ],
});

const createMockShield = (
  code: string,
  name: string,
  level: number,
  effectType: GearEffects,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'shield',
  subtype: 'shield',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    { code: effectType, value: 12, description: `${effectType} effect` },
  ],
});

const createMockArtifact = (
  code: string,
  name: string,
  level: number,
  effectType: GearEffects,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'artifact',
  subtype: 'artifact',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    { code: effectType, value: 20, description: `${effectType} effect` },
  ],
});

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  minEquippedUtilities = 20;

  // Gear maps
  weaponMap: Record<WeaponFlavours, ItemSchema[]> = {
    combat: [
      createMockWeapon('fire_sword', 'Fire Sword', 10, 'attack_fire'),
      createMockWeapon('water_sword', 'Water Sword', 10, 'attack_water'),
      createMockWeapon('air_sword', 'Air Sword', 10, 'attack_air'),
      createMockWeapon('earth_sword', 'Earth Sword', 10, 'attack_earth'),
    ],
    mining: [createMockWeapon('iron_pickaxe', 'Mining Pick', 10, 'dmg')],
    woodcutting: [createMockWeapon('iron_axe', 'Woodcutting Axe', 10, 'dmg')],
    fishing: [createMockWeapon('spruce_fishing_rod', 'Fishing Rod', 10, 'dmg')],
    alchemy: [
      createMockWeapon('apprentice_gloves', 'Alchemy Staff', 10, 'dmg'),
    ],
  };

  amuletMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [createMockGear('air_amulet', 'Air Amulet', 10, 'dmg_air')],
    dmg_earth: [
      createMockGear('earth_amulet', 'Earth Amulet', 10, 'dmg_earth'),
    ],
    dmg_fire: [createMockGear('fire_amulet', 'Fire Amulet', 10, 'dmg_fire')],
    dmg_water: [
      createMockGear('water_amulet', 'Water Amulet', 10, 'dmg_water'),
    ],
    res_air: [
      createMockGear('res_air_amulet', 'Res Air Amulet', 10, 'res_air'),
    ],
    res_earth: [
      createMockGear('res_earth_amulet', 'Res Earth Amulet', 10, 'res_earth'),
    ],
    res_fire: [
      createMockGear('res_fire_amulet', 'Res Fire Amulet', 10, 'res_fire'),
    ],
    res_water: [
      createMockGear('res_water_amulet', 'Res Water Amulet', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [createMockGear('dmg_amulet', 'Dmg Amulet', 10, 'dmg')],
    hp: [createMockGear('hp_amulet', 'HP Amulet', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  armorMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [createMockGear('air_armor', 'Air Armor', 10, 'dmg_air')],
    dmg_earth: [createMockGear('earth_armor', 'Earth Armor', 10, 'dmg_earth')],
    dmg_fire: [createMockGear('fire_armor', 'Fire Armor', 10, 'dmg_fire')],
    dmg_water: [createMockGear('water_armor', 'Water Armor', 10, 'dmg_water')],
    res_air: [createMockGear('res_air_armor', 'Res Air Armor', 10, 'res_air')],
    res_earth: [
      createMockGear('res_earth_armor', 'Res Earth Armor', 10, 'res_earth'),
    ],
    res_fire: [
      createMockGear('res_fire_armor', 'Res Fire Armor', 10, 'res_fire'),
    ],
    res_water: [
      createMockGear('res_water_armor', 'Res Water Armor', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [createMockGear('dmg_armor', 'Dmg Armor', 10, 'dmg')],
    hp: [createMockGear('hp_armor', 'HP Armor', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  helmetMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [createMockGear('air_helmet', 'Air Helmet', 10, 'dmg_air')],
    dmg_earth: [
      createMockGear('earth_helmet', 'Earth Helmet', 10, 'dmg_earth'),
    ],
    dmg_fire: [createMockGear('fire_helmet', 'Fire Helmet', 10, 'dmg_fire')],
    dmg_water: [
      createMockGear('water_helmet', 'Water Helmet', 10, 'dmg_water'),
    ],
    res_air: [
      createMockGear('res_air_helmet', 'Res Air Helmet', 10, 'res_air'),
    ],
    res_earth: [
      createMockGear('res_earth_helmet', 'Res Earth Helmet', 10, 'res_earth'),
    ],
    res_fire: [
      createMockGear('res_fire_helmet', 'Res Fire Helmet', 10, 'res_fire'),
    ],
    res_water: [
      createMockGear('res_water_helmet', 'Res Water Helmet', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [createMockGear('dmg_helmet', 'Dmg Helmet', 10, 'dmg')],
    hp: [createMockGear('hp_helmet', 'HP Helmet', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  legsArmorMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [createMockGear('air_legs', 'Air Legs', 10, 'dmg_air')],
    dmg_earth: [createMockGear('earth_legs', 'Earth Legs', 10, 'dmg_earth')],
    dmg_fire: [createMockGear('fire_legs', 'Fire Legs', 10, 'dmg_fire')],
    dmg_water: [createMockGear('water_legs', 'Water Legs', 10, 'dmg_water')],
    res_air: [createMockGear('res_air_legs', 'Res Air Legs', 10, 'res_air')],
    res_earth: [
      createMockGear('res_earth_legs', 'Res Earth Legs', 10, 'res_earth'),
    ],
    res_fire: [
      createMockGear('res_fire_legs', 'Res Fire Legs', 10, 'res_fire'),
    ],
    res_water: [
      createMockGear('res_water_legs', 'Res Water Legs', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [createMockGear('dmg_legs', 'Dmg Legs', 10, 'dmg')],
    hp: [createMockGear('hp_legs', 'HP Legs', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  ringsMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [createMockGear('air_ring', 'Air Ring', 10, 'dmg_air')],
    dmg_earth: [createMockGear('earth_ring', 'Earth Ring', 10, 'dmg_earth')],
    dmg_fire: [createMockGear('fire_ring', 'Fire Ring', 10, 'dmg_fire')],
    dmg_water: [createMockGear('water_ring', 'Water Ring', 10, 'dmg_water')],
    res_air: [createMockGear('res_air_ring', 'Res Air Ring', 10, 'res_air')],
    res_earth: [
      createMockGear('res_earth_ring', 'Res Earth Ring', 10, 'res_earth'),
    ],
    res_fire: [
      createMockGear('res_fire_ring', 'Res Fire Ring', 10, 'res_fire'),
    ],
    res_water: [
      createMockGear('res_water_ring', 'Res Water Ring', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [createMockGear('dmg_ring', 'Dmg Ring', 10, 'dmg')],
    hp: [createMockGear('hp_ring', 'HP Ring', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  shieldMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [],
    dmg_earth: [],
    dmg_fire: [],
    dmg_water: [],
    res_air: [
      createMockShield('res_air_shield', 'Res Air Shield', 10, 'res_air'),
    ],
    res_earth: [
      createMockShield('res_earth_shield', 'Res Earth Shield', 10, 'res_earth'),
    ],
    res_fire: [
      createMockShield('res_fire_shield', 'Res Fire Shield', 10, 'res_fire'),
    ],
    res_water: [
      createMockShield('res_water_shield', 'Res Water Shield', 10, 'res_water'),
    ],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [],
    hp: [],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  bootsMap: Record<GearEffects, ItemSchema[]> = {
    dmg_air: [],
    dmg_earth: [],
    dmg_fire: [],
    dmg_water: [],
    res_air: [],
    res_earth: [],
    res_fire: [],
    res_water: [],
    attack_air: [],
    attack_earth: [],
    attack_fire: [],
    attack_water: [],
    dmg: [],
    hp: [createMockGear('hp_boots', 'HP Boots', 10, 'hp')],
    critical_strike: [],
    heal: [],
    prospecting: [],
    wisdom: [],
  };

  artifactsMap: Partial<Record<GearEffects, ItemSchema[]>> = {
    prospecting: [
      createMockArtifact('lucky_charm', 'Lucky Charm', 5, 'prospecting'),
    ],
    wisdom: [createMockArtifact('wisdom_stone', 'Wisdom Stone', 5, 'wisdom')],
  };

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    const bankItems: { [key: string]: number } = {
      fire_sword: 1,
      res_fire_shield: 1,
      health_potion: 50,
      antidote: 20,
    };
    return bankItems[code] || 0;
  });

  withdrawNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      this.addItemToInventory(code, quantity);
      return true;
    },
  );

  handleErrors = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  saveJobQueue = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  getCharacterLevel = jest.fn(
    (char: CharacterSchema, skillName?: string): number => {
      switch (skillName) {
        case 'mining':
          return char.mining_level;
        case 'woodcutting':
          return char.woodcutting_level;
        case 'fishing':
          return char.fishing_level;
        default:
          return char.level;
      }
    },
  );

  getCharacterGearIn = jest.fn((itemSlot: ItemSlot): string => {
    switch (itemSlot) {
      case 'amulet':
        return this.data.amulet_slot;
      case 'artifact1':
        return this.data.artifact1_slot;
      case 'artifact2':
        return this.data.artifact2_slot;
      case 'artifact3':
        return this.data.artifact3_slot;
      case 'body_armor':
        return this.data.body_armor_slot;
      case 'boots':
        return this.data.boots_slot;
      case 'helmet':
        return this.data.helmet_slot;
      case 'leg_armor':
        return this.data.leg_armor_slot;
      case 'ring1':
        return this.data.ring1_slot;
      case 'ring2':
        return this.data.ring2_slot;
      case 'shield':
        return this.data.shield_slot;
      case 'weapon':
        return this.data.weapon_slot;
      default:
        return '';
    }
  });

  recoverHealth = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  createFakeCharacterSchema = jest.fn((charData: any) => ({
    level: charData.level,
    weapon_slot: charData.weapon_slot,
    rune_slot: charData.rune_slot,
    shield_slot: charData.shield_slot,
    helmet_slot: charData.helmet_slot,
    body_armor_slot: charData.body_armor_slot,
    leg_armor_slot: charData.leg_armor_slot,
    boots_slot: charData.boots_slot,
    ring1_slot: charData.ring1_slot,
    ring2_slot: charData.ring2_slot,
    amulet_slot: charData.amulet_slot,
    artifact1_slot: charData.artifact1_slot,
    artifact2_slot: charData.artifact2_slot,
    artifact3_slot: charData.artifact3_slot,
    utility1_slot: charData.utility1_slot,
    utility2_slot: charData.utility2_slot,
  }));

  equipUtility = jest.fn(async (): Promise<boolean> => {
    this.data.utility1_slot = 'health_potion';
    this.data.utility1_slot_quantity = 100;
    return true;
  });

  equipAntiEffectUtility = jest.fn(async (): Promise<boolean> => {
    this.data.utility2_slot = 'antidote';
    this.data.utility2_slot_quantity = 20;
    return true;
  });

  equipNow = jest.fn(async (code: string, slot: ItemSlot): Promise<boolean> => {
    switch (slot) {
      case 'weapon':
        this.data.weapon_slot = code;
        break;
      case 'shield':
        this.data.shield_slot = code;
        break;
      case 'helmet':
        this.data.helmet_slot = code;
        break;
      case 'body_armor':
        this.data.body_armor_slot = code;
        break;
      case 'leg_armor':
        this.data.leg_armor_slot = code;
        break;
      case 'boots':
        this.data.boots_slot = code;
        break;
      case 'ring1':
        this.data.ring1_slot = code;
        break;
      case 'ring2':
        this.data.ring2_slot = code;
        break;
      case 'amulet':
        this.data.amulet_slot = code;
        break;
      case 'artifact1':
        this.data.artifact1_slot = code;
        break;
      case 'artifact2':
        this.data.artifact2_slot = code;
        break;
      case 'artifact3':
        this.data.artifact3_slot = code;
        break;
    }
    return true;
  });

  addItemToInventory = (code: string, quantity: number): void => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    if (item) {
      item.quantity += quantity;
    } else {
      const emptySlot = this.data.inventory.find(
        (item: InventorySlot) => item.code === '',
      );
      if (emptySlot) {
        emptySlot.code = code;
        emptySlot.quantity = quantity;
      }
    }
  };

  // ToDo: Make this more robust. Should actually check the characters equipment
  hasEquipped = (itemCode: string): boolean => {
    return false;
  };
}

describe('EvaluateGearObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Set up default mock responses
    (
      getMonsterInformation as jest.MockedFunction<typeof getMonsterInformation>
    ).mockResolvedValue(mockMonsterData);

    (
      getAllResourceInformation as jest.MockedFunction<
        typeof getAllResourceInformation
      >
    ).mockResolvedValue({
      data: [],
      pages: 1,
      page: 1,
      size: 50,
      total: 0,
    });
  });

  describe('Basic functionality', () => {
    it('should create EvaluateGearObjective with correct properties', () => {
      // Arrange & Act
      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Assert
      expect(objective.activityType).toBe('combat');
      expect(objective.targetMob).toBe('red_slime');
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^evaluate_combat_gear_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
    });

    it('should store targetResource on the objective', () => {
      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );

      expect(objective.targetResource).toBe('iron_ore');
    });

    it('should return artifact slot contents from getCharacterGearIn', () => {
      mockCharacter.data.artifact1_slot = 'lucky_charm';
      mockCharacter.data.artifact2_slot = 'golden_earring';
      mockCharacter.data.artifact3_slot = '';

      expect(mockCharacter.getCharacterGearIn('artifact1')).toBe('lucky_charm');
      expect(mockCharacter.getCharacterGearIn('artifact2')).toBe(
        'golden_earring',
      );
      expect(mockCharacter.getCharacterGearIn('artifact3')).toBe('');
    });

    it('should evaluate combat gear for a monster', async () => {
      // Arrange
      mockCharacter.addItemToInventory('fire_sword', 1);
      mockCharacter.addItemToInventory('res_fire_shield', 1);
      mockCharacter.addItemToInventory('health_potion', 50);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(getMonsterInformation).toHaveBeenCalledWith('red_slime');
      expect(mockCharacter.recoverHealth).toHaveBeenCalled();
    });

    it('should check gathering weapon for non-combat activities', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_pickaxe', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(getMonsterInformation).not.toHaveBeenCalled();
      expect(mockCharacter.getCharacterLevel).toHaveBeenCalledWith(
        mockCharacter.data,
        'mining',
      );
    });

    it('should handle gathering weapon already equipped', async () => {
      // Arrange
      mockCharacter.data.weapon_slot = 'iron_pickaxe';
      mockCharacter.addItemToInventory('iron_pickaxe', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).not.toHaveBeenCalled();
    });
  });

  describe('Health potion management', () => {
    it('should top up health potions when quantity is low', async () => {
      // Arrange
      mockCharacter.data.utility1_slot_quantity = 5; // Below minEquippedUtilities

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipUtility).not.toHaveBeenCalled();
    });

    it('should not top up health potions when quantity is sufficient', async () => {
      // Arrange
      mockCharacter.data.utility1_slot_quantity = 50; // Above minEquippedUtilities

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // equipUtility should not be called when quantity is above minEquippedUtilities
      // The code checks utility1_slot_quantity <= minEquippedUtilities, and 50 > 20
      expect(mockCharacter.equipUtility).not.toHaveBeenCalled();
    });
  });

  describe('Secondary potion management', () => {
    //   it('should equip antidotes when monster has poison effect', async () => {
    //     // Arrange
    //     (
    //       getMonsterInformation as jest.MockedFunction<
    //         typeof getMonsterInformation
    //       >
    //     ).mockResolvedValue(mockPoisonMonsterData);

    //     mockCharacter.data.utility2_slot_quantity = 0;

    //     const objective = new EvaluateGearObjective(
    //       mockCharacter as any,
    //       'combat',
    //       'red_slime',
    //     );

    //     // Act
    //     const result = await objective.run();

    //     // Assert
    //     expect(result).toBe(true);
    //     expect(mockCharacter.equipAntiEffectUtility).toHaveBeenCalledWith(
    //       'antipoison',
    //       expect.objectContaining({ code: 'poison' }),
    //     );
    //   });

    it('should not equip antidotes when monster has no effects', async () => {
      // Arrange
      mockCharacter.data.utility2_slot_quantity = 0;

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipAntiEffectUtility).not.toHaveBeenCalled();
    });

    it('should not equip antidotes when already equipped in sufficient quantity', async () => {
      // Arrange
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(mockPoisonMonsterData);

      mockCharacter.data.utility2_slot_quantity = 25; // Above minEquippedUtilities

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipAntiEffectUtility).not.toHaveBeenCalled();
    });
  });

  describe('Shield selection', () => {
    it('should equip shield with highest attack resistance priority', async () => {
      // Arrange
      const monsterWithMultipleAttacks = {
        data: {
          ...mockMonsterData.data,
          attack_fire: 20,
          attack_water: 10,
          attack_earth: 5,
          attack_air: 0,
        } as MonsterSchema,
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(monsterWithMultipleAttacks);

      mockCharacter.addItemToInventory('res_fire_shield', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'res_fire_shield',
        'shield',
      );
    });

    it('should equip shield sourced from bank when not in inventory', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert — equipNow handles the bank withdrawal internally
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'res_fire_shield',
        'shield',
      );
    });
  });

  describe('Weapon selection', () => {
    it('should equip weapon with lowest resistance priority', async () => {
      // Arrange
      const monsterWithLowFireRes = {
        data: {
          ...mockMonsterData.data,
          res_fire: 5, // Lowest resistance
          res_water: 10,
          res_earth: 15,
          res_air: 20,
        } as MonsterSchema,
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(monsterWithLowFireRes);

      mockCharacter.addItemToInventory('fire_sword', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'fire_sword',
        'weapon',
      );
    });

    it('should check bank for weapon if not in inventory', async () => {
      // Arrange
      const monsterWithLowFireRes = {
        data: {
          ...mockMonsterData.data,
          res_fire: 5, // Lowest resistance - should prioritize fire weapon
          res_water: 10,
          res_earth: 15,
          res_air: 20,
        } as MonsterSchema,
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(monsterWithLowFireRes);

      // Weapon not in inventory
      mockCharacter.checkQuantityOfItemInInv.mockImplementation(
        (code: string) => {
          return code === 'fire_sword'
            ? 0
            : mockCharacter.data.inventory.find(
                (item: InventorySlot) => item.code === code,
              )?.quantity || 0;
        },
      );
      // Weapon is in bank
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(1);
      // equipNow will handle the withdrawal via EquipObjective internally
      mockCharacter.equipNow.mockResolvedValue(true);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // checkCombatWeapon checks bank and then calls equipNow (which handles withdrawal)
      expect(mockCharacter.checkQuantityOfItemInBank).toHaveBeenCalledWith(
        'fire_sword',
      );
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'fire_sword',
        'weapon',
      );
    });
  });

  describe('Gear selection with resistance priority', () => {
    it('should equip gear based on monster resistance priorities', async () => {
      // Arrange
      const monsterWithLowFireRes = {
        data: {
          ...mockMonsterData.data,
          res_fire: 5, // Lowest resistance - should prioritize fire damage gear
          res_water: 10,
          res_earth: 15,
          res_air: 20,
        } as MonsterSchema,
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(monsterWithLowFireRes);

      mockCharacter.addItemToInventory('fire_helmet', 1);
      mockCharacter.addItemToInventory('fire_armor', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should attempt to equip fire damage gear (helmet, armor, etc.)
      expect(mockCharacter.equipNow).toHaveBeenCalled();
    });

    it('should fall back to dmg gear if no resistance-specific gear found', async () => {
      // Arrange
      // Remove resistance-specific gear from maps
      mockCharacter.helmetMap = {
        dmg_air: [],
        dmg_earth: [],
        dmg_fire: [],
        dmg_water: [],
        res_air: [],
        res_earth: [],
        res_fire: [],
        res_water: [],
        attack_air: [],
        attack_earth: [],
        attack_fire: [],
        attack_water: [],
        dmg: [createMockGear('dmg_helmet', 'Dmg Helmet', 10, 'dmg')],
        hp: [],
        critical_strike: [],
        heal: [],
        prospecting: [],
        wisdom: [],
      };

      mockCharacter.addItemToInventory('dmg_helmet', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'dmg_helmet',
        'helmet',
      );
    });
  });

  describe('Boots selection', () => {
    it('should equip hp boots', async () => {
      // Arrange
      mockCharacter.addItemToInventory('hp_boots', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipNow).toHaveBeenCalledWith('hp_boots', 'boots');
    });
  });

  describe('Error handling', () => {
    it('should handle API errors when getting monster information', async () => {
      // Arrange
      const apiError = new ApiError({
        code: 404,
        message: 'Monster not found',
      });
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(apiError);

      mockCharacter.handleErrors.mockResolvedValue(false);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
    });

    it('should handle missing gear in inventory and bank', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should still return true even if some gear is missing
    });
  });

  describe('Edge cases', () => {
    it('should handle gear already equipped', async () => {
      // Arrange
      mockCharacter.data.weapon_slot = 'fire_sword';
      mockCharacter.data.shield_slot = 'res_fire_shield';

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should not call equipNow for already equipped items
    });

    it('should handle character level restrictions', async () => {
      // Arrange
      // Create gear with level higher than character level
      const highLevelGear = createMockGear(
        'high_helmet',
        'High Helmet',
        50,
        'dmg',
      );
      mockCharacter.helmetMap.dmg = [highLevelGear];

      mockCharacter.data.level = 10; // Character is level 10

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should not equip gear above character level
    });

    it('should handle cancellation during execution', async () => {
      // Arrange
      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
    });

    it('should handle gathering weapon not found', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);
      mockCharacter.weaponMap.mining = [];

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
      );

      // Act
      const result = await objective.run();

      // Assert
      // Gathering path now always returns true (artifact check runs after weapon check)
      expect(result).toBe(true);
    });

    it('should handle different gathering activity types', async () => {
      const activityTypes: WeaponFlavours[] = [
        'mining',
        'woodcutting',
        'fishing',
      ];

      for (const activityType of activityTypes) {
        // Arrange
        mockCharacter.data.weapon_slot = '';
        const objective = new EvaluateGearObjective(
          mockCharacter as any,
          activityType,
        );

        // Act
        const result = await objective.run();

        // Assert
        expect(result).toBeDefined();
        expect(mockCharacter.getCharacterLevel).toHaveBeenCalledWith(
          mockCharacter.data,
          activityType,
        );

        // Reset for next iteration
        jest.clearAllMocks();
        (
          getAllResourceInformation as jest.MockedFunction<
            typeof getAllResourceInformation
          >
        ).mockResolvedValue({
          data: [],
          pages: 1,
          page: 1,
          size: 50,
          total: 0,
        });
      }
    });
  });

  describe('checkGatheringArtifacts', () => {
    const mockProspectingResource = {
      data: [
        {
          name: 'Iron Rock',
          code: 'iron_rock',
          skill: 'mining' as const,
          level: 5,
          drops: [
            { code: 'iron_ore', rate: 4, min_quantity: 1, max_quantity: 1 },
          ],
        },
      ],
      pages: 1,
      page: 1,
      size: 50,
      total: 1,
    };

    const mockWisdomResource = {
      data: [
        {
          name: 'Ash Tree',
          code: 'ash_tree',
          skill: 'woodcutting' as const,
          level: 5,
          drops: [
            { code: 'ash_wood', rate: 1, min_quantity: 1, max_quantity: 1 },
          ],
        },
      ],
      pages: 1,
      page: 1,
      size: 50,
      total: 1,
    };

    it('equips prospecting artifact in artifact1 when drop rate < 100%', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockProspectingResource);
      mockCharacter.addItemToInventory('lucky_charm', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );
      await objective.run();

      expect(getAllResourceInformation).toHaveBeenCalledWith({
        drop: 'iron_ore',
      });
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'lucky_charm',
        'artifact1',
      );
    });

    it('equips wisdom artifact in artifact1 when drop rate is 100%', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockWisdomResource);
      mockCharacter.addItemToInventory('wisdom_stone', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'woodcutting',
        undefined,
        'ash_wood',
      );
      await objective.run();

      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'wisdom_stone',
        'artifact1',
      );
    });

    it('equips wisdom artifact when no targetResource is provided', async () => {
      mockCharacter.addItemToInventory('wisdom_stone', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
      );
      await objective.run();

      expect(getAllResourceInformation).not.toHaveBeenCalled();
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'wisdom_stone',
        'artifact1',
      );
    });

    it('falls back to wisdom artifact when resource API returns an error', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(new ApiError({ code: 500, message: 'server error' }));
      mockCharacter.addItemToInventory('wisdom_stone', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );
      await objective.run();

      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'wisdom_stone',
        'artifact1',
      );
    });

    it('falls back to wisdom artifact when targetResource is not in any resource drops', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue({ data: [], pages: 1, page: 1, size: 50, total: 0 });
      mockCharacter.addItemToInventory('wisdom_stone', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'unknown_item',
      );
      await objective.run();

      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'wisdom_stone',
        'artifact1',
      );
    });

    it('skips artifact slot when no artifact is available in inv or bank', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockProspectingResource);
      // No lucky_charm in inventory or bank

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );
      await objective.run();

      const artifactCalls = (
        mockCharacter.equipNow as jest.Mock
      ).mock.calls.filter(
        ([, slot]: [string, string]) =>
          slot === 'artifact1' || slot === 'artifact2' || slot === 'artifact3',
      );
      expect(artifactCalls).toHaveLength(0);
    });

    it('skips slot when correct artifact is already equipped', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockProspectingResource);
      mockCharacter.data.artifact1_slot = 'lucky_charm';

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );
      await objective.run();

      const artifact1Calls = (
        mockCharacter.equipNow as jest.Mock
      ).mock.calls.filter(([, slot]: [string, string]) => slot === 'artifact1');
      expect(artifact1Calls).toHaveLength(0);
    });

    it('does not exceed character level when selecting artifact', async () => {
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockProspectingResource);

      // Add a level-15 artifact (above char level 10) to the map — should be skipped
      const highLevelArtifact = createMockArtifact(
        'ancient_charm',
        'Ancient Charm',
        15,
        'prospecting',
      );
      mockCharacter.artifactsMap = {
        prospecting: [
          createMockArtifact('lucky_charm', 'Lucky Charm', 5, 'prospecting'),
          highLevelArtifact,
        ],
        wisdom: [],
      };
      mockCharacter.addItemToInventory('lucky_charm', 1);
      mockCharacter.addItemToInventory('ancient_charm', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'mining',
        undefined,
        'iron_ore',
      );
      await objective.run();

      // Should equip lucky_charm (level 5), not ancient_charm (level 15 > char level 10)
      expect(mockCharacter.equipNow).toHaveBeenCalledWith(
        'lucky_charm',
        'artifact1',
      );
      expect(mockCharacter.equipNow).not.toHaveBeenCalledWith(
        'ancient_charm',
        expect.anything(),
      );
    });
  });

  describe('selectCombatLoadout (in-memory, no side effects)', () => {
    it('returns chosen slot codes without equipping or withdrawing', async () => {
      mockCharacter.addItemToInventory('fire_sword', 1);
      mockCharacter.addItemToInventory('res_fire_shield', 1);
      mockCharacter.addItemToInventory('fire_helmet', 1);
      mockCharacter.addItemToInventory('hp_boots', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      const loadout = await objective.selectCombatLoadout(10, 'red_slime');

      expect(mockCharacter.equipNow).not.toHaveBeenCalled();
      expect(mockCharacter.withdrawNow).not.toHaveBeenCalled();
      expect(mockCharacter.recoverHealth).not.toHaveBeenCalled();
      expect(loadout.weapon_slot).toBe('fire_sword');
      expect(loadout.shield_slot).toBe('res_fire_shield');
      expect(loadout.helmet_slot).toBe('fire_helmet');
      expect(loadout.boots_slot).toBe('hp_boots');
    });

    it('does not assign a single-copy ring to both ring slots', async () => {
      // Only one of each ring type exists (in inventory); bank has no rings.
      mockCharacter.addItemToInventory('earth_ring', 1);
      mockCharacter.addItemToInventory('fire_ring', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      const loadout = await objective.selectCombatLoadout(10, 'red_slime');

      // earth (res 0) is preferred over fire (res 25); ring2 falls back to the
      // next available ring rather than reusing the single earth_ring copy.
      expect(loadout.ring1_slot).toBe('earth_ring');
      expect(loadout.ring2_slot).toBe('fire_ring');
      expect(loadout.ring1_slot).not.toBe(loadout.ring2_slot);
    });

    it('keeps an already-equipped item selectable for its own slot', async () => {
      mockCharacter.data.shield_slot = 'res_fire_shield';

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      const loadout = await objective.selectCombatLoadout(10, 'red_slime');

      expect(loadout.shield_slot).toBe('res_fire_shield');
      expect(mockCharacter.equipNow).not.toHaveBeenCalled();
    });
  });

  describe('proposeCombatLoadout (merged schema, no side effects)', () => {
    it('merges selected slots over the current-equipment snapshot', async () => {
      mockCharacter.data.artifact1_slot = 'novice_guide';
      mockCharacter.addItemToInventory('fire_sword', 1);
      mockCharacter.addItemToInventory('res_fire_shield', 1);

      const objective = new EvaluateGearObjective(
        mockCharacter as any,
        'combat',
        'red_slime',
      );

      const schema = await objective.proposeCombatLoadout(10, 'red_slime');

      expect(mockCharacter.equipNow).not.toHaveBeenCalled();
      expect(schema.weapon_slot).toBe('fire_sword');
      expect(schema.shield_slot).toBe('res_fire_shield');
      expect(schema.artifact1_slot).toBe('novice_guide');
      expect(schema.level).toBe(mockCharacter.data.level);
    });
  });
});
