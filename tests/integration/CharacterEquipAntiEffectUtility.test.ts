import { jest } from '@jest/globals';
import { Character } from '../../src/core/Character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import {
  CharacterSchema,
  ItemSchema,
  SimpleEffectSchema,
} from '../../src/types/types.js';

// Mock the necessary modules
jest.mock('../../src/api_calls/Items', () => ({
  actionEquipItem: jest.fn(),
  actionUse: jest.fn(),
  getItemInformation: jest.fn(),
  getAllItemInformation: jest.fn(),
}));

jest.mock('../../src/core/CraftObjective', () => ({
  CraftObjective: jest.fn(),
}));

// Mock utility items
const createMockUtility = (
  code: string,
  name: string,
  level: number,
  effectValue: number,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'utility',
  subtype: 'potion',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    {
      code: 'antipoison',
      value: effectValue,
      description: `Counteracts ${effectValue} poison`,
    },
  ],
});

describe('Character.equipAntiEffectUtility Unit Tests', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh character
    character = new Character(JSON.parse(JSON.stringify(mockCharacterData)));

    // Set up utilities map
    character.utilitiesMap = {
      antipoison: [
        createMockUtility('weak_antidote', 'Weak Antidote', 1, 10),
        createMockUtility('antidote', 'Antidote', 5, 25),
        createMockUtility('strong_antidote', 'Strong Antidote', 10, 50),
      ],
      restore: [],
      boost_dmg_air: [],
      boost_dmg_earth: [],
      boost_dmg_fire: [],
      boost_dmg_water: [],
      boost_hp: [],
      boost_res_air: [],
      boost_res_earth: [],
      boost_res_fire: [],
      boost_res_water: [],
    };

    character.maxEquippedUtilities = 100;
    character.data.utility2_slot_quantity = 0;
    character.data.utility2_slot = '';

    // Helper function to add items to inventory
    const addItemToInventory = (code: string, quantity: number): void => {
      const item = character.data.inventory.find(
        (item: InventorySlot) => item.code === code,
      );
      if (item) {
        item.quantity += quantity;
      } else {
        const emptySlot = character.data.inventory.find(
          (item: InventorySlot) => item.code === '',
        );
        if (emptySlot) {
          emptySlot.code = code;
          emptySlot.quantity = quantity;
        }
      }
    };

    // Mock methods
    character.checkQuantityOfItemInInv = jest.fn((code: string): number => {
      const item = character.data.inventory.find(
        (item: InventorySlot) => item.code === code,
      );
      return item ? item.quantity : 0;
    }) as jest.MockedFunction<(code: string) => number>;

    character.checkQuantityOfItemInBank = jest.fn(async (): Promise<number> => {
      return 0; // Default to 0, can be overridden in tests
    }) as jest.MockedFunction<(code: string) => Promise<number>>;

    character.withdrawNow = jest.fn(
      async (quantity: number, code: string): Promise<boolean> => {
        // Simulate adding item to inventory
        addItemToInventory(code, quantity);
        return true;
      },
    ) as jest.MockedFunction<
      (quantity: number, code: string) => Promise<boolean>
    >;

    character.equipNow = jest.fn(
      async (
        code: string,
        slot: string,
        quantity?: number,
      ): Promise<boolean> => {
        if (slot === 'utility2') {
          character.data.utility2_slot = code;
          character.data.utility2_slot_quantity =
            (character.data.utility2_slot_quantity || 0) + (quantity || 1);
        }
        return true;
      },
    ) as jest.MockedFunction<
      (code: string, slot: string, quantity?: number) => Promise<boolean>
    >;

    character.craftNow = jest.fn(
      async (quantity: number, code: string): Promise<boolean> => {
        // Simulate crafting by adding to inventory
        addItemToInventory(code, quantity);
        return true;
      },
    ) as jest.MockedFunction<
      (quantity: number, code: string) => Promise<boolean>
    >;

    character.getCharacterLevel = jest.fn(
      (char: CharacterSchema, skillName?: string): number => {
        if (skillName === 'alchemy') {
          return char.alchemy_level;
        }
        return char.level;
      },
    ) as jest.MockedFunction<
      (char?: CharacterSchema, skillName?: string) => number
    >;

    // Expose helper function for tests
    (character as any).addItemToInventory = addItemToInventory;
  });

  describe('Basic functionality', () => {
    it('should equip antidote from inventory when sufficient quantity available', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 20,
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      // weak_antidote (value 10) < 20, so it will be skipped with continue
      // antidote (value 25) >= 20, so it will be used
      (character as any).addItemToInventory('antidote', 100);

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      // Should skip weak_antidote (value 10 < 20) via continue without checking inventory
      // Should check inventory and use antidote (value 25 >= 20)
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'antidote',
      );
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.equipNow).toHaveBeenCalledWith(
        'antidote',
        'utility2',
        100,
      );
      expect(result).toBe(true);
    });

    it('should select the appropriate antidote based on mob effect value', async () => {
      // Arrange
      const weakMobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5,
        description: 'Weak poison',
      };
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100);

      // Act
      await character.equipAntiEffectUtility('antipoison', weakMobEffect);

      // Assert
      // Should try weak_antidote first since it's level 1 and suitable for value 5
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
    });

    it('should skip weak antidotes and find suitable one', async () => {
      // Arrange
      const strongMobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 30,
        description: 'Strong poison',
      };
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100); // Only 10 value - will be skipped
      (character as any).addItemToInventory('antidote', 100); // 25 value - will be skipped
      (character as any).addItemToInventory('strong_antidote', 100); // 50 value - will be used

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        strongMobEffect,
      );

      // Assert
      // Should skip weak_antidote (value 10 < 30) and antidote (value 25 < 30) via continue
      // Should check inventory and use strong_antidote (value 50 >= 30)
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'strong_antidote',
      );
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'antidote',
      );
      expect(character.equipNow).toHaveBeenCalledWith(
        'strong_antidote',
        'utility2',
        100,
      );
      expect(result).toBe(true);
    });

    it('should skip utilities above character level', async () => {
      // Arrange
      character.data.level = 1; // Low level
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 10,
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100);

      // Act
      await character.equipAntiEffectUtility('antipoison', mobEffect);

      // Assert
      // Should only check weak_antidote (level 1), skip antidote (level 5) and strong_antidote (level 10)
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'antidote',
      );
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'strong_antidote',
      );
    });
  });

  describe('Bank withdrawal', () => {
    it('should withdraw from bank when inventory quantity is insufficient', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote (value 10)
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 50; // Partially filled
      (character as any).addItemToInventory('weak_antidote', 10); // Not enough in inventory (need 50 more)
      character.checkQuantityOfItemInBank = jest.fn(
        async (code: string): Promise<number> => {
          return code === 'weak_antidote' ? 100 : 0;
        },
      );

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.checkQuantityOfItemInBank).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.withdrawNow).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should withdraw partial amount from bank when needed', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 80;
      (character as any).addItemToInventory('weak_antidote', 10); // Not enough (need 20 more)
      character.checkQuantityOfItemInBank = jest.fn(
        async (code: string): Promise<number> => {
          return code === 'weak_antidote' ? 50 : 0; // Bank has 50, but we only need 20
        },
      );

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(character.withdrawNow).toHaveBeenCalled();
      const withdrawCall = (character.withdrawNow as jest.Mock).mock.calls[0];
      expect(withdrawCall[0]).toBeLessThanOrEqual(50); // Should not withdraw more than available
      expect(result).toBe(true);
    });
  });

  describe('Crafting fallback', () => {
    it('should attempt to craft when item not in inventory or bank', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote (value 10)
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      character.data.alchemy_level = 1; // Can craft weak_antidote (level 1)
      (character.checkQuantityOfItemInInv as jest.Mock).mockReturnValue(0);
      (character.checkQuantityOfItemInBank as any).mockResolvedValue(0);

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      // Should attempt to craft if character has alchemy level
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.checkQuantityOfItemInBank).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.craftNow).toHaveBeenCalledWith(100, 'weak_antidote');
      expect(result).toBe(true);
    });

    it('should not attempt to craft if alchemy level is too low', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 20,
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      character.data.alchemy_level = 1; // Too low to craft antidote (level 5)
      (character.checkQuantityOfItemInInv as jest.Mock).mockReturnValue(0);
      (character.checkQuantityOfItemInBank as any).mockResolvedValue(0);

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(character.craftNow).not.toHaveBeenCalled();
      // Should return false or undefined when can't craft
      expect(result).toBeFalsy();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty utilities map', async () => {
      // Arrange
      character.utilitiesMap = {
        antipoison: [],
        restore: [],
        boost_dmg_air: [],
        boost_dmg_earth: [],
        boost_dmg_fire: [],
        boost_dmg_water: [],
        boost_hp: [],
        boost_res_air: [],
        boost_res_earth: [],
        boost_res_fire: [],
        boost_res_water: [],
      };
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 20,
        description: 'Poison effect',
      };

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(result).toBeUndefined();
      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalled();
    });

    it('should handle mob effect with no matching utility', async () => {
      // Arrange
      // Create utilities map with only restore utilities
      character.utilitiesMap = {
        antipoison: [],
        restore: [createMockUtility('health_potion', 'Health Potion', 1, 0)],
        boost_dmg_air: [],
        boost_dmg_earth: [],
        boost_dmg_fire: [],
        boost_dmg_water: [],
        boost_hp: [],
        boost_res_air: [],
        boost_res_earth: [],
        boost_res_fire: [],
        boost_res_water: [],
      };
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 20,
        description: 'Poison effect',
      };

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(result).toBeUndefined();
    });

    it('should handle utility items without effects array', async () => {
      // Arrange
      const utilityWithoutEffects: ItemSchema = {
        code: 'mystery_potion',
        name: 'Mystery Potion',
        level: 1,
        type: 'utility',
        subtype: 'potion',
        description: '',
        craft: null,
        tradeable: true,
        conditions: [],
        effects: undefined,
      };
      character.utilitiesMap.antipoison = [utilityWithoutEffects];
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 20,
        description: 'Poison effect',
      };

      // Act
      await character.equipAntiEffectUtility('antipoison', mobEffect);

      // Assert
      // Should handle gracefully without crashing
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalled();
    });

    it('should handle partial inventory and bank combination', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 50;
      (character as any).addItemToInventory('weak_antidote', 30); // Partial amount (need 50 more)
      character.checkQuantityOfItemInBank = jest.fn(
        async (code: string): Promise<number> => {
          return code === 'weak_antidote' ? 100 : 0;
        },
      );

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      // Should equip from inventory first (30), then withdraw from bank (50), then equip remaining
      expect(character.equipNow).toHaveBeenCalled();
      expect(character.checkQuantityOfItemInBank).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.withdrawNow).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when crafting fails', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      character.data.alchemy_level = 1; // Can craft weak_antidote (level 1)
      (character.checkQuantityOfItemInInv as jest.Mock).mockReturnValue(0);
      (character.checkQuantityOfItemInBank as any).mockResolvedValue(0);
      (character.craftNow as any).mockResolvedValue(false); // Crafting fails

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.checkQuantityOfItemInBank).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.craftNow).toHaveBeenCalledWith(100, 'weak_antidote');
      expect(result).toBe(false); // Crafting failed
    });
  });

  describe('Utility slot management', () => {
    it('should equip to utility2 slot', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100);

      // Act
      await character.equipAntiEffectUtility('antipoison', mobEffect);

      // Assert
      // All equipNow calls should use utility2 slot
      const equipCalls = (character.equipNow as jest.Mock).mock.calls;
      if (equipCalls.length > 0) {
        equipCalls.forEach((call) => {
          if (call.length >= 2) {
            expect(call[1]).toBe('utility2');
          }
        });
      }
    });

    it('should calculate needed quantity based on utility2 slot current quantity', async () => {
      // Arrange
      const mobEffect: SimpleEffectSchema = {
        code: 'poison',
        value: 5, // Use value that works with weak_antidote
        description: 'Poison effect',
      };
      character.data.utility2_slot_quantity = 50;
      character.maxEquippedUtilities = 100;
      (character as any).addItemToInventory('weak_antidote', 100);

      // Act
      const result = await character.equipAntiEffectUtility(
        'antipoison',
        mobEffect,
      );

      // Assert
      // Should calculate needed quantity as maxEquippedUtilities - utility2_slot_quantity
      // 100 - 50 = 50 needed
      expect(character.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'weak_antidote',
      );
      expect(character.equipNow).toHaveBeenCalledWith(
        'weak_antidote',
        'utility2',
        50, // Should equip the needed amount (50)
      );
      expect(result).toBe(true);
    });
  });
});
