import { jest } from '@jest/globals';
import { DepositObjective } from '../../src/classes/DepositObjective.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { MapSchema } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/classes/Error.js';

// Mock the API modules
jest.mock('../../src/api_calls/Actions', () => ({
  actionDepositItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Bank', () => ({
  actionDepositGold: jest.fn(),
}));

jest.mock('../../src/api_calls/Maps', () => ({
  getMaps: jest.fn(),
}));

// Import the mocked functions
import { actionDepositItems } from '../../src/api_calls/Actions.js';
import { actionDepositGold } from '../../src/api_calls/Bank.js';
import { getMaps } from '../../src/api_calls/Maps.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  move = jest.fn(
    async (destination: { x: number; y: number }): Promise<void> => {
      this.data.x = destination.x;
      this.data.y = destination.y;
    },
  );

  evaluateClosestMap = jest.fn(
    (maps: MapSchema[]): { x: number; y: number } => {
      return { x: maps[0].x, y: maps[0].y };
    },
  );

  executeJobNow = jest.fn(async (): Promise<boolean> => {
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
const mockDepositItemResponse = {
  data: {
    character: {
      ...mockCharacterData,
      inventory: [
        { slot: 1, code: 'apple', quantity: 45 },
        { slot: 2, code: '', quantity: 0 },
        { slot: 3, code: '', quantity: 0 },
        { slot: 4, code: '', quantity: 0 },
        { slot: 5, code: '', quantity: 0 },
        { slot: 6, code: '', quantity: 0 },
        { slot: 7, code: '', quantity: 0 },
        { slot: 8, code: '', quantity: 0 },
        { slot: 9, code: '', quantity: 0 },
        { slot: 10, code: '', quantity: 0 },
        { slot: 11, code: '', quantity: 0 },
        { slot: 12, code: '', quantity: 0 },
        { slot: 13, code: '', quantity: 0 },
        { slot: 14, code: '', quantity: 0 },
        { slot: 15, code: '', quantity: 0 },
        { slot: 16, code: '', quantity: 0 },
        { slot: 17, code: '', quantity: 0 },
        { slot: 18, code: '', quantity: 0 },
        { slot: 19, code: '', quantity: 0 },
        { slot: 20, code: '', quantity: 0 },
      ],
    },
    cooldown: {
      total_seconds: 20,
      remaining_seconds: 20,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:55.196Z',
      reason: 'deposit_item' as const,
    },
    items: [{ code: 'apple', quantity: 10 }],
    bank: [
      {
        code: 'apple',
        quantity: 10,
      },
    ],
  },
};

const mockDepositGoldResponse = {
  data: {
    character: {
      ...mockCharacterData,
      gold: 500, // Reduced gold after deposit
    },
    bank: {
      quantity: 10,
    },
    cooldown: {
      total_seconds: 20,
      remaining_seconds: 20,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:55.196Z',
      reason: 'deposit_item' as const,
    },
  },
};

const mockBankMapData = {
  data: [
    {
      map_id: 1,
      name: 'Bank',
      skin: 'bank',
      x: 100,
      y: 100,
      layer: 'overworld' as const,
      access: {
        type: 'standard' as const,
      },
      interactions: {},
    },
  ],
  total: 1,
  page: 1,
  size: 50,
};

describe('DepositObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;
  let depositObjective: DepositObjective;
  let target: ObjectiveTargets;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    // Reset character data to original state with deep copy
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Set up default target
    target = {
      code: 'iron_ore',
      quantity: 10,
    };

    // Create fresh deposit objective
    depositObjective = new DepositObjective(mockCharacter as any, target);

    // Set up default mock responses
    (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
      mockBankMapData,
    );
    (
      actionDepositItems as jest.MockedFunction<typeof actionDepositItems>
    ).mockResolvedValue(mockDepositItemResponse);
    (
      actionDepositGold as jest.MockedFunction<typeof actionDepositGold>
    ).mockResolvedValue(mockDepositGoldResponse);
  });

  describe('Basic functionality', () => {
    it('should create DepositObjective with correct properties', () => {
      // Arrange & Act
      const objective = new DepositObjective(mockCharacter as any, target);

      // Assert
      expect(objective.target).toEqual(target);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^deposit_10_iron_ore_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
    });

    it('should successfully deposit specific items', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(15);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(getMaps).toHaveBeenCalledWith({ content_type: 'bank' });
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 100, y: 100 });
      expect(actionDepositItems).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
          gold: 1000,
        }),
        [{ quantity: 10, code: 'iron_ore' }],
      );
    });

    it('should successfully deposit all items when code is "all"', async () => {
      // Arrange
      const allTarget: ObjectiveTargets = { code: 'all', quantity: 0 };
      const allDepositObjective = new DepositObjective(
        mockCharacter as any,
        allTarget,
      );

      // Add items to inventory for this test
      mockCharacter.addItemToInventory('iron_ore', 5);
      mockCharacter.addItemToInventory('wood', 10);

      // Act
      const result = await allDepositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionDepositItems).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
        }),
        expect.arrayContaining([
          { code: 'apple', quantity: 45 },
          { code: 'iron_ore', quantity: 5 },
          { code: 'wood', quantity: 10 },
        ]),
      );
    });

    it('should successfully deposit all of a specific item when quantity is 0', async () => {
      // Arrange
      const allQuantityTarget: ObjectiveTargets = {
        code: 'iron_ore',
        quantity: 0,
      };
      const allQuantityObjective = new DepositObjective(
        mockCharacter as any,
        allQuantityTarget,
      );

      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(25);

      // Act
      const result = await allQuantityObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionDepositItems).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
        }),
        [{ quantity: 25, code: 'iron_ore' }],
      );
    });

    it('should successfully deposit gold', async () => {
      // Arrange
      const goldTarget: ObjectiveTargets = { code: 'gold', quantity: 500 };
      const goldObjective = new DepositObjective(
        mockCharacter as any,
        goldTarget,
      );

      mockCharacter.data.gold = 1000;

      // Act
      const result = await goldObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionDepositGold).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
          gold: 1000,
        }),
        500,
      );
    });
  });

  describe('Error handling', () => {
    it('should handle API errors and retry', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (actionDepositItems as jest.MockedFunction<typeof actionDepositItems>)
        .mockResolvedValueOnce(apiError)
        .mockResolvedValueOnce(mockDepositItemResponse);

      mockCharacter.handleErrors.mockResolvedValue(true);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
      expect(actionDepositItems).toHaveBeenCalledTimes(2);
    });

    it('should return false when max retries exceeded', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (
        actionDepositItems as jest.MockedFunction<typeof actionDepositItems>
      ).mockResolvedValue(apiError);

      mockCharacter.handleErrors.mockResolvedValue(true);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionDepositItems).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    it('should handle bank not found error', async () => {
      // Arrange
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        size: 50,
      });

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionDepositItems).not.toHaveBeenCalled();
    });

    it('should handle getMaps API error', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Maps API error' });
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        apiError,
      );
      mockCharacter.handleErrors.mockResolvedValue(false);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
    });

    it('should handle missing character data in response', async () => {
      // Arrange
      const responseWithoutCharacter = {
        data: {
          // Missing character data
        },
      };
      (
        actionDepositItems as jest.MockedFunction<typeof actionDepositItems>
      ).mockResolvedValue(responseWithoutCharacter as any);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(true);
      // Should still return true even if character data is missing
    });
  });

  describe('Edge cases', () => {
    it('should handle empty inventory when depositing all', async () => {
      // Arrange
      const allTarget: ObjectiveTargets = { code: 'all', quantity: 0 };
      const allDepositObjective = new DepositObjective(
        mockCharacter as any,
        allTarget,
      );

      // Clear inventory - remove the apple that's in the default mock data
      mockCharacter.data.inventory = mockCharacter.data.inventory.map(
        (slot) => ({
          ...slot,
          code: '',
          quantity: 0,
        }),
      );

      // Act
      const result = await allDepositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionDepositItems).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
        }),
        [], // Empty array for empty inventory
      );
    });

    it('should handle inventory with empty slots when depositing all', async () => {
      // Arrange
      const allTarget: ObjectiveTargets = { code: 'all', quantity: 0 };
      const allDepositObjective = new DepositObjective(
        mockCharacter as any,
        allTarget,
      );

      // Add items to inventory for this test
      mockCharacter.addItemToInventory('iron_ore', 5);

      // Act
      const result = await allDepositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(actionDepositItems).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestCharacter',
          level: 10,
        }),
        expect.arrayContaining([
          { code: 'apple', quantity: 45 },
          { code: 'iron_ore', quantity: 5 },
        ]),
      );
    });

    it('should update character data after successful deposit', async () => {
      // Arrange
      const updatedCharacterData = {
        ...mockCharacterData,
        inventory: [
          { slot: 1, code: 'apple', quantity: 45 },
          { slot: 2, code: '', quantity: 0 },
          // ... rest of inventory
        ],
      };
      const responseWithUpdatedCharacter = {
        data: {
          character: updatedCharacterData,
        },
      };
      (
        actionDepositItems as jest.MockedFunction<typeof actionDepositItems>
      ).mockResolvedValue(responseWithUpdatedCharacter as any);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.data).toEqual(updatedCharacterData);
    });
  });

  describe('Movement and location', () => {
    it('should move to bank location before depositing', async () => {
      // Arrange
      const customBankMap = {
        data: [
          {
            map_id: 2,
            name: 'Custom Bank',
            skin: 'bank',
            x: 200,
            y: 300,
            layer: 'overworld' as const,
            access: { type: 'standard' as const },
            interactions: {},
          },
        ],
        total: 1,
        page: 1,
        size: 50,
      };
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        customBankMap,
      );
      mockCharacter.evaluateClosestMap.mockReturnValue({ x: 200, y: 300 });
      mockCharacter.executeJobNow.mockResolvedValue(true);

      // Act
      const result = await depositObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.evaluateClosestMap).toHaveBeenCalledWith(
        customBankMap.data,
      );
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 200, y: 300 });
    });
  });
});
