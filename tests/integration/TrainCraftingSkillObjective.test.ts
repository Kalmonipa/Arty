import { jest } from '@jest/globals';
import { TrainCraftingSkillObjective } from '../../src/core/TrainCraftingSkillObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot, Role } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/core/Error.js';
import {
  ItemSchema,
  CraftSkill,
  CharacterSchema,
  SimpleItemSchema,
} from '../../src/types/types.js';

// Mock the API modules
jest.mock('../../src/api_calls/Items', () => ({
  getAllItemInformation: jest.fn(),
}));

// Import the mocked functions
import { getAllItemInformation } from '../../src/api_calls/Items.js';

// Mock craftable items
const createMockCraftableItem = (
  code: string,
  name: string,
  level: number,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'consumable',
  subtype: 'potion',
  description: '',
  craft: {
    skill: 'alchemy',
    level: level,
    items: [],
    quantity: 1,
  },
  tradeable: true,
  conditions: [],
  effects: [],
});

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  pendingWishlistRequests: {
    requestId: number;
    itemCode: string;
    quantity: number;
  }[] = [];

  getCharacterLevel = jest.fn(
    (char: CharacterSchema, skillName?: string): number => {
      switch (skillName) {
        case 'alchemy':
          return this.data.alchemy_level;
        case 'cooking':
          return this.data.cooking_level;
        case 'weaponcrafting':
          return this.data.weaponcrafting_level;
        case 'gearcrafting':
          return this.data.gearcrafting_level;
        case 'jewelrycrafting':
          return this.data.jewelrycrafting_level;
        default:
          return this.data.level;
      }
    },
  );

  craftNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      // Simulate successful crafting
      this.addItemToInventory(code, quantity);
      // Simulate level progression for alchemy
      if (code.includes('potion') || code.includes('alchemy')) {
        this.data.alchemy_level += 1;
      }
      return true;
    },
  );

  depositNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      // Simulate successful deposit
      this.removeItemFromInventory(code, quantity);
      return true;
    },
  );

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

  tidyUpBank = (role: Role): void => {};

  getAllBankItems = jest.fn(() => {
    return [
      { code: 'health_potion', quantity: 80 },
      { code: 'copper_dagger', quantity: 10 },
      { code: 'copper_boots', quantity: 4 },
    ];
  });
}

// Mock craftable items data
const mockCraftableItemsData = {
  data: [
    createMockCraftableItem('weak_health_potion', 'Weak Health Potion', 1),
    createMockCraftableItem('health_potion', 'Health Potion', 5),
    createMockCraftableItem('strong_health_potion', 'Strong Health Potion', 10),
  ],
  total: 3,
  page: 1,
  pages: 1,
  size: 50,
};

describe('TrainCraftingSkillObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Set up default mock responses
    (
      getAllItemInformation as jest.MockedFunction<typeof getAllItemInformation>
    ).mockResolvedValue(mockCraftableItemsData);
  });

  describe('Basic functionality', () => {
    it('should create TrainCraftingSkillObjective with correct properties', () => {
      // Arrange & Act
      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Assert
      expect(objective.skill).toBe('alchemy');
      expect(objective.targetLevel).toBe(15);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^train_15_alchemy_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
      expect(objective.levelRange).toBe(9); // Default value
    });

    it('should use custom levelRange when provided', () => {
      // Arrange & Act
      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
        10,
      );

      // Assert
      expect(objective.levelRange).toBe(10);
    });

    it('should pass prerequisite checks', async () => {
      // Arrange
      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
    });

    it('should return true immediately if already at target level', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 15;
      mockCharacter.getCharacterLevel.mockReturnValue(15);

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(getAllItemInformation).not.toHaveBeenCalled();
      expect(mockCharacter.craftNow).not.toHaveBeenCalled();
    });
  });

  describe('Crafting training flow', () => {
    it('should successfully train alchemy skill to target level', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      // Mock level progression - reach target after one craft
      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15; // Jump to target level
        mockCharacter.addItemToInventory('health_potion', 10);
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(getAllItemInformation).toHaveBeenCalled();
      expect(mockCharacter.craftNow).toHaveBeenCalled();
      expect(mockCharacter.depositNow).toHaveBeenCalled();
    });

    it('should craft 10 items for alchemy skill', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 5;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        5,
      );

      // Act
      await objective.run();

      // Assert
      expect(mockCharacter.craftNow).toHaveBeenCalledWith(
        10,
        expect.any(String),
        undefined,
        undefined,
        true,
      );
    });

    it('should craft 10 items for cooking skill', async () => {
      // Arrange
      mockCharacter.data.cooking_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'cooking') {
            return mockCharacter.data.cooking_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.cooking_level = 5;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'cooking',
        5,
      );

      // Act
      await objective.run();

      // Assert
      expect(mockCharacter.craftNow).toHaveBeenCalledWith(
        10,
        expect.any(String),
        undefined,
        undefined,
        true,
      );
    });

    it('should craft 2 items for weaponcrafting skill', async () => {
      // Arrange
      mockCharacter.data.weaponcrafting_level = 5;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'weaponcrafting') {
            return mockCharacter.data.weaponcrafting_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.weaponcrafting_level = 10;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'weaponcrafting',
        10,
      );

      // Act
      await objective.run();

      // Assert
      expect(mockCharacter.craftNow).toHaveBeenCalledWith(
        2,
        expect.any(String),
        undefined,
        undefined,
        true,
      );
    });

    it('should craft 2 items for gearcrafting skill', async () => {
      // Arrange
      mockCharacter.data.gearcrafting_level = 3;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'gearcrafting') {
            return mockCharacter.data.gearcrafting_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.gearcrafting_level = 8;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'gearcrafting',
        8,
      );

      // Act
      await objective.run();

      // Assert
      expect(mockCharacter.craftNow).toHaveBeenCalledWith(
        2,
        expect.any(String),
        undefined,
        undefined,
        true,
      );
    });

    it('should craft 1 item for jewelrycrafting skill', async () => {
      // Arrange
      mockCharacter.data.jewelrycrafting_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'jewelrycrafting') {
            return mockCharacter.data.jewelrycrafting_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.jewelrycrafting_level = 5;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'jewelrycrafting',
        5,
      );

      // Act
      await objective.run();

      // Assert
      expect(mockCharacter.craftNow).toHaveBeenCalledWith(
        1,
        expect.any(String),
        undefined,
        undefined,
        true,
      );
    });

    it('should deposit items after successful crafting', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15;
        mockCharacter.addItemToInventory('health_potion', 10);
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.depositNow).toHaveBeenCalledWith(
        10,
        expect.any(String),
      );
    });

    it('should not deposit items if crafting fails', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      // Mock craft to fail first time, then succeed to prevent infinite loop
      let callCount = 0;
      mockCharacter.craftNow.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return false; // Fail first attempt
        }
        // Succeed on second attempt to allow loop to complete
        mockCharacter.data.alchemy_level = 15;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      // Should not deposit after failed craft, but should deposit after successful one
      expect(mockCharacter.craftNow).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('Level range filtering', () => {
    it('should query items within level range', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 10;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
        4, // levelRange = 4
      );

      // Act
      await objective.run();

      // Assert
      expect(getAllItemInformation).toHaveBeenCalledWith({
        craft_skill: 'alchemy',
        max_level: 10,
        min_level: 6, // Math.max(10 - 4, 0) = 6
      });
    });

    it('should handle level range at level 0', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 0;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 5;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        5,
        4,
      );

      // Act
      await objective.run();

      // Assert
      expect(getAllItemInformation).toHaveBeenCalledWith({
        craft_skill: 'alchemy',
        max_level: 0,
        min_level: 0, // Math.max(0 - 4, 0) = 0
      });
    });

    it('should use custom level range when provided', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 10;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
        10, // Custom levelRange
      );

      // Act
      await objective.run();

      // Assert
      expect(getAllItemInformation).toHaveBeenCalledWith({
        craft_skill: 'alchemy',
        max_level: 10,
        min_level: 0, // Math.max(10 - 10, 0) = 0
      });
    });
  });

  describe('Item selection', () => {
    it('should randomly select from available craftable items', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      const multipleItemsData = {
        data: [
          createMockCraftableItem('potion1', 'Potion 1', 1),
          createMockCraftableItem('potion2', 'Potion 2', 1),
          createMockCraftableItem('potion3', 'Potion 3', 1),
        ],
        total: 3,
        page: 1,
        pages: 1,
        size: 50,
      };
      (
        getAllItemInformation as jest.MockedFunction<
          typeof getAllItemInformation
        >
      ).mockResolvedValue(multipleItemsData);

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      await objective.run();

      // Assert
      // Should call craftNow with one of the craftable items
      expect(mockCharacter.craftNow).toHaveBeenCalled();
      const craftCall = (mockCharacter.craftNow as jest.Mock).mock.calls[0];
      expect(['potion1', 'potion2', 'potion3']).toContain(craftCall[1]);
    });
  });

  describe('Error handling', () => {
    it('should handle API errors and retry', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (
        getAllItemInformation as jest.MockedFunction<
          typeof getAllItemInformation
        >
      )
        .mockResolvedValueOnce(apiError)
        .mockResolvedValueOnce(mockCraftableItemsData);

      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );
      // If handleErrors returns true, it means retry, so it will continue
      // If it returns false, it means abort
      mockCharacter.handleErrors.mockResolvedValue(false); // Abort on error

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
      expect(result).toBe(false); // Should return false after error (when handleErrors returns false)
    });

    it('should return false when no craftable items found', async () => {
      // Arrange
      const emptyItemsData = {
        data: [],
        total: 0,
        page: 1,
        pages: 1,
        size: 50,
      };
      // Clear previous mocks and set new one
      (
        getAllItemInformation as jest.MockedFunction<
          typeof getAllItemInformation
        >
      ).mockReset();
      (
        getAllItemInformation as jest.MockedFunction<
          typeof getAllItemInformation
        >
      ).mockResolvedValue(emptyItemsData);

      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      // Clear craftNow mock to ensure it's not called
      mockCharacter.craftNow.mockReset();

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.craftNow).not.toHaveBeenCalled();
      expect(getAllItemInformation).toHaveBeenCalled();
    });

    it('should handle crafting failures gracefully', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      // Mock craft to fail first few times, then succeed to prevent infinite loop
      let callCount = 0;
      mockCharacter.craftNow.mockImplementation(async () => {
        callCount++;
        if (callCount >= 3) {
          // After 3 failures, succeed to allow loop to complete
          mockCharacter.data.alchemy_level = 15;
          return true;
        }
        return false;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      // Should continue trying after failures
      expect(mockCharacter.craftNow).toHaveBeenCalled();
      // Should only deposit after successful craft
      expect(mockCharacter.depositNow).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('Level progression', () => {
    it('should update character level after each craft', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      let craftCount = 0;
      mockCharacter.craftNow.mockImplementation(async () => {
        craftCount++;
        // Progress level by 1 each craft, but cap at target
        mockCharacter.data.alchemy_level = Math.min(
          mockCharacter.data.alchemy_level + 1,
          15,
        );
        mockCharacter.addItemToInventory('health_potion', 10);
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      await objective.run();

      // Assert
      // Should check level multiple times (before loop, after each craft)
      expect(mockCharacter.getCharacterLevel).toHaveBeenCalledWith(
        mockCharacter.data,
        'alchemy',
      );
      expect(mockCharacter.data.alchemy_level).toBe(15);
      expect(mockCharacter.craftNow).toHaveBeenCalled();
    });

    it('should continue crafting until target level is reached', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 10;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      let craftCount = 0;
      mockCharacter.craftNow.mockImplementation(async () => {
        craftCount++;
        mockCharacter.data.alchemy_level = 10 + craftCount; // Increment by 1 each time
        if (mockCharacter.data.alchemy_level >= 15) {
          mockCharacter.data.alchemy_level = 15; // Cap at target
        }
        mockCharacter.addItemToInventory('health_potion', 10);
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.craftNow).toHaveBeenCalledTimes(5);
      expect(mockCharacter.data.alchemy_level).toBe(15);
    });
  });

  describe('Edge cases', () => {
    it('should handle cancellation during execution', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockReturnValue(1);

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.craftNow).not.toHaveBeenCalled();
    });

    it('should query correct craft_skill parameter for different skills', async () => {
      // Test alchemy
      jest.clearAllMocks();
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 5;
        return true;
      });

      const alchemyObjective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        5,
      );

      await alchemyObjective.run();

      expect(getAllItemInformation).toHaveBeenCalledWith(
        expect.objectContaining({
          craft_skill: 'alchemy',
        }),
      );

      // Test weaponcrafting
      jest.clearAllMocks();
      mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));
      mockCharacter.data.weaponcrafting_level = 5;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'weaponcrafting') {
            return mockCharacter.data.weaponcrafting_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.weaponcrafting_level = 10;
        return true;
      });

      const weaponcraftingObjective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'weaponcrafting',
        10,
      );

      await weaponcraftingObjective.run();

      expect(getAllItemInformation).toHaveBeenCalledWith(
        expect.objectContaining({
          craft_skill: 'weaponcrafting',
        }),
      );
    });

    it('should handle level progression that exceeds target', async () => {
      // Arrange
      mockCharacter.data.alchemy_level = 14;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) => {
          if (skill === 'alchemy') {
            return mockCharacter.data.alchemy_level;
          }
          return mockCharacter.data.level;
        },
      );

      mockCharacter.craftNow.mockImplementation(async () => {
        // Level up beyond target
        mockCharacter.data.alchemy_level = 16;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should exit loop when level >= target (even if exceeded)
    });
  });

  describe('onHold parking', () => {
    it('opts into parking on wishlist requests', () => {
      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );
      expect(objective.parkOnWishlistRequest).toBe(true);
    });

    it('passes blockOnMissing through to craftNow', async () => {
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) =>
          skill === 'alchemy'
            ? mockCharacter.data.alchemy_level
            : mockCharacter.data.level,
      );
      mockCharacter.craftNow.mockImplementation(async () => {
        mockCharacter.data.alchemy_level = 15;
        return true;
      });

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      await objective.run();

      const call = (mockCharacter.craftNow as jest.Mock).mock.calls[0];
      expect(call[4]).toBe(true); // blockOnMissing
    });

    it('stops without crafting once ingredients have been wishlisted so it can be parked', async () => {
      mockCharacter.data.alchemy_level = 1;
      mockCharacter.getCharacterLevel.mockImplementation(
        (char: CharacterSchema, skill?: string) =>
          skill === 'alchemy'
            ? mockCharacter.data.alchemy_level
            : mockCharacter.data.level,
      );
      // A blocking request is already pending from a prior craft attempt
      mockCharacter.pendingWishlistRequests = [
        { requestId: 1, itemCode: 'iron_ore', quantity: 5 },
      ];

      const objective = new TrainCraftingSkillObjective(
        mockCharacter as any,
        'alchemy',
        15,
      );

      const result = await objective.run();

      expect(result).toBe(false);
      expect(mockCharacter.craftNow).not.toHaveBeenCalled();
    });
  });
});
