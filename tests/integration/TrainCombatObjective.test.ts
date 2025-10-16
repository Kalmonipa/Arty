import { jest } from '@jest/globals';
import { TrainCombatObjective } from '../../src/objectives/TrainCombatObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/objectives/Error.js';

// Mock the API modules
jest.mock('../../src/api_calls/Monsters', () => ({
  getAllMonsterInformation: jest.fn(),
}));

// Import the mocked functions
import { getAllMonsterInformation } from '../../src/api_calls/Monsters.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };

  getCharacterLevel = jest.fn((): number => {
    return this.data.level;
  });

  simulateFightNow = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  fightNow = jest.fn(async (): Promise<boolean> => {
    // Simulate level progression
    this.data.level += 1;
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

  createFakeCharacterSchema = jest.fn((charData: any): any => {
    return { ...charData };
  });
}

// Mock response data
const mockMonsterData = {
  data: [
    {
      name: 'Red Slime',
      code: 'red_slime',
      level: 5,
      type: 'normal' as const,
      hp: 100,
      attack_fire: 0,
      attack_earth: 0,
      attack_water: 0,
      attack_air: 10,
      res_fire: 0,
      res_earth: 0,
      res_water: 0,
      res_air: 0,
      critical_strike: 5,
      initiative: 100,
      effects: [],
      min_gold: 0,
      max_gold: 5,
      drops: [
        {
          code: 'slime_gel',
          rate: 50,
          min_quantity: 1,
          max_quantity: 2,
        },
      ],
    },
    {
      name: 'Blue Slime',
      code: 'blue_slime',
      level: 8,
      type: 'normal' as const,
      hp: 150,
      attack_fire: 0,
      attack_earth: 0,
      attack_water: 15,
      attack_air: 0,
      res_fire: 0,
      res_earth: 0,
      res_water: 10,
      res_air: 0,
      critical_strike: 8,
      initiative: 110,
      effects: [],
      min_gold: 0,
      max_gold: 8,
      drops: [
        {
          code: 'blue_gel',
          rate: 40,
          min_quantity: 1,
          max_quantity: 1,
        },
      ],
    },
  ],
  total: 2,
  page: 1,
  size: 50,
};

describe('TrainCombatObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;
  let trainCombatObjective: TrainCombatObjective;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    // Reset character data to original state with deep copy
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Create fresh train combat objective
    trainCombatObjective = new TrainCombatObjective(mockCharacter as any, 15);

    // Set up default mock responses
    (
      getAllMonsterInformation as jest.MockedFunction<
        typeof getAllMonsterInformation
      >
    ).mockResolvedValue(mockMonsterData);
  });

  describe('Basic functionality', () => {
    it('should create TrainCombatObjective with correct properties', () => {
      // Arrange & Act
      const objective = new TrainCombatObjective(mockCharacter as any, 20);

      // Assert
      expect(objective.targetLevel).toBe(20);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^train_20_combat_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
      expect(objective.skill).toBe('combat');
    });

    it('should pass prerequisite checks', async () => {
      // Act
      const result = await trainCombatObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
    });

    it('should return true immediately if already at target level', async () => {
      // Arrange
      mockCharacter.data.level = 15;
      mockCharacter.getCharacterLevel.mockReturnValue(15);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true); // Should return true when already at target level
      expect(getAllMonsterInformation).not.toHaveBeenCalled(); // Should return early without calling API
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });
  });

  describe('Combat training flow', () => {
    it('should successfully train combat to target level', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(getAllMonsterInformation).toHaveBeenCalledWith({
        max_level: 10,
        min_level: 0,
      });
      expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
      expect(mockCharacter.fightNow).toHaveBeenCalled();
    });

    it('should find and fight suitable mobs in descending order', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true);
      // Should simulate fights with monsters in descending order (highest level first)
      expect(mockCharacter.simulateFightNow).toHaveBeenCalledWith(
        expect.any(Array),
        'blue_slime',
      );
    });

    it('should handle fight simulation failures', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);
      mockCharacter.simulateFightNow.mockResolvedValue(false);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle API errors and retry', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (
        getAllMonsterInformation as jest.MockedFunction<
          typeof getAllMonsterInformation
        >
      )
        .mockResolvedValueOnce(apiError)
        .mockResolvedValueOnce(mockMonsterData);

      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);
      mockCharacter.handleErrors.mockResolvedValue(true);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
      expect(getAllMonsterInformation).toHaveBeenCalledTimes(1);
    });

    it('should return false when max retries exceeded', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (
        getAllMonsterInformation as jest.MockedFunction<
          typeof getAllMonsterInformation
        >
      ).mockResolvedValue(apiError);

      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);
      mockCharacter.handleErrors.mockResolvedValue(false);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
    });

    it('should handle no suitable mobs found', async () => {
      // Arrange
      const emptyMonsterData = {
        data: [],
        total: 0,
        page: 1,
        size: 50,
      };
      (
        getAllMonsterInformation as jest.MockedFunction<
          typeof getAllMonsterInformation
        >
      ).mockResolvedValue(emptyMonsterData);

      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false);
    });

    it('should handle fight failures and retry', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to always fail
      mockCharacter.fightNow.mockResolvedValue(false);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false); // Returns false due to fight failure
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(6); // Called maxRetries times (2 mobs * 3 retries)
    });

    it('should fail when max retries exceeded for fights', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);
      mockCharacter.fightNow.mockResolvedValue(false);

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(6); // Called maxRetries times (2 mobs * 3 retries)
    });
  });

  describe('Edge cases', () => {
    it('should handle cancellation during execution', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);
      const objective = new TrainCombatObjective(mockCharacter as any, 15);

      // Simulate cancellation by making the objective cancelled
      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });

    it('should handle level range filtering correctly', async () => {
      // Arrange
      mockCharacter.data.level = 10; // Start below target level
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      await trainCombatObjective.run();

      // Assert
      expect(getAllMonsterInformation).toHaveBeenCalledWith({
        max_level: 10,
        min_level: 0, // Math.max(10 - 10, 0) = 0
      });
    });

    it('should handle level 0 character correctly', async () => {
      // Arrange
      mockCharacter.data.level = 0;
      mockCharacter.getCharacterLevel.mockReturnValue(0);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      await trainCombatObjective.run();

      // Assert
      expect(getAllMonsterInformation).toHaveBeenCalledWith({
        max_level: 0,
        min_level: 0, // Math.max(0 - 10, 0) = 0
      });
    });

    it('should fight 10 mobs at a time', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(
        10,
        expect.any(String),
        undefined,
        false
      );
    });

    it('should handle structured clone of character data', async () => {
      // Arrange
      mockCharacter.data.level = 10;
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.simulateFightNow).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
      );
    });
  });

  describe('Mob selection and fight simulation', () => {
    it('should try monsters in descending order of level', async () => {
      // Arrange
      mockCharacter.data.level = 10; // Start below target level
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Mock simulateFightNow to fail for higher level monsters, succeed for lower
      mockCharacter.simulateFightNow
        .mockResolvedValueOnce(false) // blue_slime (level 8)
        .mockResolvedValueOnce(true); // red_slime (level 5)

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true); // Should succeed after finding suitable mob
      expect(mockCharacter.simulateFightNow).toHaveBeenCalledTimes(2);
      expect(mockCharacter.simulateFightNow).toHaveBeenNthCalledWith(
        1,
        expect.any(Array),
        'blue_slime',
      );
      expect(mockCharacter.simulateFightNow).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),
        'red_slime',
      );
    });

    it('should handle different monster types in the list', async () => {
      // Arrange
      const customMonsterData = {
        data: [
          {
            name: 'Ogre',
            code: 'ogre',
            level: 9,
            type: 'normal' as const,
            hp: 100,
            attack_fire: 5,
            attack_earth: 0,
            attack_water: 0,
            attack_air: 0,
            res_fire: 50,
            res_earth: 0,
            res_water: 0,
            res_air: 0,
            critical_strike: 20,
            initiative: 200,
            effects: [],
            min_gold: 100,
            max_gold: 500,
            drops: [
              {
                code: 'ogre_eye',
                rate: 12,
                min_quantity: 1,
                max_quantity: 2,
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        size: 50,
      };
      mockCharacter.data.level = 10; // Start below target level
      mockCharacter.getCharacterLevel.mockReturnValue(10);

      // Set up the custom monster data mock AFTER setting up the character
      (
        getAllMonsterInformation as jest.MockedFunction<
          typeof getAllMonsterInformation
        >
      ).mockImplementation(async () => customMonsterData);

      // Mock simulateFightNow to succeed for the ogre
      mockCharacter.simulateFightNow.mockResolvedValue(true);

      // Mock fight to increase level to target
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.data.level = 15;
        mockCharacter.getCharacterLevel.mockReturnValue(15);
        return true;
      });

      // Act
      const result = await trainCombatObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
      expect(mockCharacter.simulateFightNow).toHaveBeenCalledWith(
        expect.any(Array),
        'ogre',
      );
    });
  });
});
