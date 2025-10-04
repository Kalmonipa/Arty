import { jest } from '@jest/globals';
import { EquipObjective } from '../../src/classes/EquipObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/classes/Error.js';
import { ItemSlot } from '../../src/types/types.js';

// Mock the API modules
jest.mock('../../src/api_calls/Items', () => ({
  actionEquipItem: jest.fn(),
}));

// Import the mocked functions
import { actionEquipItem } from '../../src/api_calls/Items.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    // Mock bank has some items
    const bankItems: { [key: string]: number } = {
      'iron_sword': 1,
      'health_potion': 50,
      'magic_ring': 1,
    };
    return bankItems[code] || 0;
  });

  withdrawNow = jest.fn(async (quantity: number, code: string): Promise<boolean> => {
    // Mock successful withdrawal
    this.addItemToInventory(code, quantity);
    return true;
  });

  handleErrors = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  saveJobQueue = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  addItemToInventory = (code: string, quantity: number): void => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    if (item) {
      item.quantity += quantity;
    } else {
      // Find first empty slot
      const emptySlot = this.data.inventory.find(
        (item: InventorySlot) => item.code === '',
      );
      if (emptySlot) {
        emptySlot.code = code;
        emptySlot.quantity = quantity;
      }
    }
  };

  removeItemFromInventory = (code: string, quantity: number): void => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    if (item) {
      item.quantity = Math.max(0, item.quantity - quantity);
      if (item.quantity === 0) {
        item.code = '';
      }
    }
  };
}

// Mock response data
const mockEquipResponse = {
  data: {
    character: {
      ...mockCharacterData,
      weapon_slot: 'iron_sword',
      utility1_slot: 'health_potion',
      utility1_slot_quantity: 10,
    },
    cooldown: {
      total_seconds: 5,
      remaining_seconds: 5,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:40.196Z',
      reason: 'equip' as const,
    },
    slot: 'weapon' as ItemSlot,
    item: {
      code: 'iron_sword',
      name: 'Iron Sword',
      level: 5,
      type: 'weapon',
      subtype: 'sword',
      description: 'A sturdy iron sword',
      craft: null,
      tradeable: true,
      conditions: [],
      effects: [],
    },
  },
};

const mockUtilityEquipResponse = {
  data: {
    character: {
      ...mockCharacterData,
      utility1_slot: 'health_potion',
      utility1_slot_quantity: 25,
    },
    cooldown: {
      total_seconds: 5,
      remaining_seconds: 5,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:40.196Z',
      reason: 'equip' as const,
    },
    slot: 'utility1' as ItemSlot,
    item: {
      code: 'health_potion',
      name: 'Health Potion',
      level: 1,
      type: 'consumable',
      subtype: 'potion',
      description: 'Restores health',
      craft: null,
      tradeable: true,
      conditions: [],
      effects: [],
    },
  },
};

describe('EquipObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    // Reset character data to original state with deep copy
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Set up default mock responses
    (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
      mockEquipResponse,
    );
  });

  describe('Basic functionality', () => {
    it('should create EquipObjective with correct properties', () => {
      // Arrange & Act
      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Assert
      expect(objective.itemCode).toBe('iron_sword');
      expect(objective.itemSlot).toBe('weapon');
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^equip_iron_sword_weapon_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
    });

    it('should successfully equip a weapon', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_sword', 1);
      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionEquipItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LongLegLarry',
          level: 10,
        }),
        {
          code: 'iron_sword',
          slot: 'weapon',
          quantity: 1,
        },
      );
    });

    it('should successfully equip armor', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_helmet', 1);
      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_helmet',
        'helmet' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionEquipItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LongLegLarry',
          level: 10,
        }),
        {
          code: 'iron_helmet',
          slot: 'helmet',
          quantity: 1,
        },
      );
    });

    it('should successfully equip utility items with quantity', async () => {
      // Arrange
      mockCharacter.addItemToInventory('health_potion', 25);
      const objective = new EquipObjective(
        mockCharacter as any,
        'health_potion',
        'utility1' as ItemSlot,
        25,
      );

      // Set up mock response for utility item
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
        mockUtilityEquipResponse,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionEquipItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LongLegLarry',
          level: 10,
        }),
        {
          code: 'health_potion',
          slot: 'utility1',
          quantity: 25,
        },
      );
    });

    it('should default quantity to 1 when not specified', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_sword', 1);
      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionEquipItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LongLegLarry',
          level: 10,
        }),
        {
          code: 'iron_sword',
          slot: 'weapon',
          quantity: 1,
        },
      );
    });
  });

  describe('Bank withdrawal functionality', () => {
    it('should withdraw from bank when item not in inventory', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(1);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.checkQuantityOfItemInBank).toHaveBeenCalledWith('iron_sword');
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(1, 'iron_sword');
      expect(actionEquipItem).toHaveBeenCalled();
    });

    it('should not withdraw from bank when item is in inventory', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_sword', 1);
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(1);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.checkQuantityOfItemInBank).not.toHaveBeenCalled();
      expect(mockCharacter.withdrawNow).not.toHaveBeenCalled();
      expect(actionEquipItem).toHaveBeenCalled();
    });

    it('should handle bank withdrawal failure gracefully', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(1);
      mockCharacter.withdrawNow.mockResolvedValue(false);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(1, 'iron_sword');
      // Should still attempt to equip even if withdrawal fails
      expect(actionEquipItem).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle API errors and retry', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>)
        .mockResolvedValueOnce(apiError)
        .mockResolvedValueOnce(mockEquipResponse);

      mockCharacter.addItemToInventory('iron_sword', 1);
      mockCharacter.handleErrors.mockResolvedValue(true);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
      expect(actionEquipItem).toHaveBeenCalledTimes(2);
    });

    it('should return false when max retries exceeded', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
        apiError,
      );

      mockCharacter.addItemToInventory('iron_sword', 1);
      mockCharacter.handleErrors.mockResolvedValue(true);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionEquipItem).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    it('should handle missing character data in response', async () => {
      // Arrange
      const responseWithoutCharacter = {
        data: {
          // Missing character data
          cooldown: {
            total_seconds: 5,
            remaining_seconds: 5,
            started_at: '2025-10-01T16:52:35.196Z',
            expiration: '2025-10-01T16:52:40.196Z',
            reason: 'equip' as const,
          },
        },
      };
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
        responseWithoutCharacter as any,
      );

      mockCharacter.addItemToInventory('iron_sword', 1);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should still return true even if character data is missing
    });

    it('should handle specific API error codes', async () => {
      // Arrange
      const itemNotFoundError = new ApiError({ code: 404, message: 'Item not found.' });
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
        itemNotFoundError,
      );

      mockCharacter.addItemToInventory('iron_sword', 1);
      mockCharacter.handleErrors.mockResolvedValue(false);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(itemNotFoundError);
    });
  });

  describe('Edge cases', () => {
    it('should handle utility slot quantity limits', async () => {
      // Arrange
      mockCharacter.addItemToInventory('health_potion', 150);
      const objective = new EquipObjective(
        mockCharacter as any,
        'health_potion',
        'utility1' as ItemSlot,
        150, // Over the 100 limit
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBeUndefined(); // Should return undefined due to quantity limit
      expect(actionEquipItem).not.toHaveBeenCalled();
    });

    it('should handle utility slot quantity validation for utility2', async () => {
      // Arrange
      mockCharacter.addItemToInventory('health_potion', 50);
      const objective = new EquipObjective(
        mockCharacter as any,
        'health_potion',
        'utility2' as ItemSlot,
        50,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionEquipItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'LongLegLarry',
          level: 10,
        }),
        {
          code: 'health_potion',
          slot: 'utility2',
          quantity: 50,
        },
      );
    });

    it('should update character data after successful equip', async () => {
      // Arrange
      const updatedCharacterData = {
        ...mockCharacterData,
        weapon_slot: 'iron_sword',
        utility1_slot: 'health_potion',
        utility1_slot_quantity: 10,
      };
      const responseWithUpdatedCharacter = {
        data: {
          character: updatedCharacterData,
          cooldown: {
            total_seconds: 5,
            remaining_seconds: 5,
            started_at: '2025-10-01T16:52:35.196Z',
            expiration: '2025-10-01T16:52:40.196Z',
            reason: 'equip' as const,
          },
        },
      };
      (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
        responseWithUpdatedCharacter as any,
      );

      mockCharacter.addItemToInventory('iron_sword', 1);

      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.data).toEqual(updatedCharacterData);
    });

    it('should handle different item slot types', async () => {
      // Test various slot types
      const slotTests = [
        { slot: 'weapon' as ItemSlot, item: 'iron_sword' },
        { slot: 'shield' as ItemSlot, item: 'wooden_shield' },
        { slot: 'helmet' as ItemSlot, item: 'iron_helmet' },
        { slot: 'body_armor' as ItemSlot, item: 'leather_armor' },
        { slot: 'leg_armor' as ItemSlot, item: 'iron_legs' },
        { slot: 'boots' as ItemSlot, item: 'iron_boots' },
        { slot: 'ring1' as ItemSlot, item: 'magic_ring' },
        { slot: 'ring2' as ItemSlot, item: 'magic_ring' },
        { slot: 'amulet' as ItemSlot, item: 'health_amulet' },
        { slot: 'artifact1' as ItemSlot, item: 'ancient_artifact' },
        { slot: 'artifact2' as ItemSlot, item: 'ancient_artifact' },
        { slot: 'artifact3' as ItemSlot, item: 'ancient_artifact' },
        { slot: 'bag' as ItemSlot, item: 'leather_bag' },
        { slot: 'rune' as ItemSlot, item: 'fire_rune' },
      ];

      for (const test of slotTests) {
        // Arrange
        mockCharacter.addItemToInventory(test.item, 1);
        const objective = new EquipObjective(
          mockCharacter as any,
          test.item,
          test.slot,
        );

        // Act
        const result = await objective.run();

        // Assert
        expect(result).toBe(true);
        expect(actionEquipItem).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'LongLegLarry',
            level: 10,
          }),
          {
            code: test.item,
            slot: test.slot,
            quantity: 1,
          },
        );

        // Reset for next test
        jest.clearAllMocks();
        (actionEquipItem as jest.MockedFunction<typeof actionEquipItem>).mockResolvedValue(
          mockEquipResponse,
        );
      }
    });
  });

  describe('Cancellation handling', () => {
    it('should handle cancellation during execution', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_sword', 1);
      const objective = new EquipObjective(
        mockCharacter as any,
        'iron_sword',
        'weapon' as ItemSlot,
      );

      // Simulate cancellation by making the objective cancelled
      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionEquipItem).not.toHaveBeenCalled();
    });
  });
});
