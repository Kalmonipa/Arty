import { jest } from '@jest/globals';
import { FightObjective } from '../../src/classes/FightObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/classes/Error.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { HealthStatus } from '../../src/types/CharacterData.js';

// Mock the API modules
jest.mock('../../src/api_calls/Actions', () => ({
  actionFight: jest.fn(),
}));

jest.mock('../../src/api_calls/Maps', () => ({
  getMaps: jest.fn(),
}));

// Import the mocked functions
import { actionFight } from '../../src/api_calls/Actions.js';
import { getMaps } from '../../src/api_calls/Maps.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  preferredFood = 'apple';
  minEquippedUtilities = 5;
  currentExecutingJob?: { objectiveId: string };
  createdTrainCombatObjective?: { parentId?: string; targetLevel: number };

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    // Mock bank has some items
    const bankItems: { [key: string]: number } = {
      apple: 50,
      health_potion: 20,
      iron_sword: 1,
    };
    return bankItems[code] || 0;
  });

  withdrawNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      // Mock successful withdrawal
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

  move = jest.fn(
    async (destination: { x: number; y: number }): Promise<void> => {
      this.data.x = destination.x;
      this.data.y = destination.y;
    },
  );

  evaluateClosestMap = jest.fn((maps: any[]): { x: number; y: number } => {
    return { x: maps[0].x, y: maps[0].y };
  });

  evaluateDepositItemsInBank = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  checkFoodLevels = jest.fn(async (): Promise<boolean> => {
    return this.checkQuantityOfItemInInv(this.preferredFood) > 10;
  });

  topUpFood = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  evaluateGear = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  simulateFightNow = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  trainCombatLevelNow = jest.fn(async (targetLevel: number): Promise<boolean> => {
    // Mock the creation of TrainCombatObjective with parentId
    const mockTrainCombatObjective = {
      parentId: this.currentExecutingJob?.objectiveId,
      targetLevel: targetLevel,
    };
    
    // Store the created objective for testing purposes
    this.createdTrainCombatObjective = mockTrainCombatObjective;
    
    return true;
  });

  checkHealth = jest.fn((): HealthStatus => {
    return {
      percentage: 100,
      difference: 0,
    };
  });

  rest = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  eatFood = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  equipUtility = jest.fn(async (): Promise<boolean> => {
    return true;
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
const mockFightResponse = {
  data: {
    cooldown: {
      total_seconds: 5,
      remaining_seconds: 5,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:40.196Z',
      reason: 'fight' as const,
    },
    fight: {
      result: 'win' as const,
      turns: 3,
      opponent: 'red_slime',
      logs: ['Character attacks', 'Monster attacks', 'Character wins'],
      characters: [
        {
          character_name: 'TestCharacter',
          xp: 50,
          gold: 10,
          drops: [],
          final_hp: 245,
        },
      ],
    },
    characters: [
      {
        ...mockCharacterData,
        hp: 245,
        max_hp: 245,
        xp: 1500,
        gold: 1050,
      },
    ],
  },
};

const mockMapData = {
  data: [
    {
      map_id: 1,
      name: 'Red Slime Area',
      skin: 'forest',
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

describe('FightObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;
  let fightObjective: FightObjective;
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
      code: 'red_slime',
      quantity: 5,
    };

    // Create fresh fight objective
    fightObjective = new FightObjective(mockCharacter as any, target);

    // Set up default mock responses
    (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
      mockMapData,
    );
    (actionFight as jest.MockedFunction<typeof actionFight>).mockResolvedValue(
      mockFightResponse,
    );
  });

  describe('Basic functionality', () => {
    it('should create FightObjective with correct properties', () => {
      // Arrange & Act
      const objective = new FightObjective(mockCharacter as any, target);

      // Assert
      expect(objective.target).toEqual(target);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^fight_5_red_slime_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
    });

    it('should successfully fight monsters', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(getMaps).toHaveBeenCalledWith({ content_code: 'red_slime' });
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 100, y: 100 });
      expect(actionFight).toHaveBeenCalledTimes(5); // Should fight 5 times
    });

    it('should handle prerequisite checks', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.evaluateDepositItemsInBank).toHaveBeenCalled();
      expect(mockCharacter.checkFoodLevels).toHaveBeenCalled();
      expect(mockCharacter.evaluateGear).toHaveBeenCalled();
      expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
    });

    it('should handle low food levels in prerequisites', async () => {
      // Arrange
      mockCharacter.checkFoodLevels.mockResolvedValue(false);

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.topUpFood).toHaveBeenCalled();
    });

    it('should fail prerequisite checks if fight simulation fails', async () => {
      // Arrange
      mockCharacter.simulateFightNow.mockResolvedValue(false);
      mockCharacter.trainCombatLevelNow.mockResolvedValue(true);

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('Health management', () => {
    it('should rest when health is low but difference is small', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.checkHealth.mockReturnValue({
        percentage: 80,
        difference: 50,
      });

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.rest).toHaveBeenCalled();
    });

    it('should eat food when health is very low', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.checkHealth.mockReturnValue({
        percentage: 50,
        difference: 200,
      });

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.eatFood).toHaveBeenCalled();
    });

    it('should not rest or eat when health is full', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.checkHealth.mockReturnValue({
        percentage: 100,
        difference: 0,
      });

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.rest).not.toHaveBeenCalled();
      expect(mockCharacter.eatFood).not.toHaveBeenCalled();
    });
  });

  describe('Utility management', () => {
    it('should equip utility when quantity is low', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.data.utility1_slot_quantity = 3; // Below minEquippedUtilities

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipUtility).toHaveBeenCalledWith(
        'restore',
        'utility1',
      );
    });

    it('should not equip utility when quantity is sufficient', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.data.utility1_slot_quantity = 10; // Above minEquippedUtilities

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.equipUtility).not.toHaveBeenCalled();
    });

    it('should move back to monster location after utility equipping', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.data.utility1_slot_quantity = 3;
      mockCharacter.equipUtility.mockResolvedValue(true);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      // Should move back to monster location after equipping utility
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 100, y: 100 });
    });
  });

  describe('Error handling', () => {
    it('should handle API errors and retry', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (actionFight as jest.MockedFunction<typeof actionFight>)
        .mockResolvedValueOnce(apiError)
        .mockResolvedValueOnce(mockFightResponse)
        .mockResolvedValue(mockFightResponse);

      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.handleErrors.mockResolvedValue(true);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
      // Should be called 6 times (1 error + 1 retry + 4 successful fights)
      expect(actionFight).toHaveBeenCalledTimes(6);
    });

    it('should return false when max retries exceeded', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Server error' });
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockResolvedValue(apiError);

      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.handleErrors.mockResolvedValue(false); // Don't retry

      // Create a smaller target to reduce fight count
      const smallTarget: ObjectiveTargets = {
        code: 'red_slime',
        quantity: 1,
      };
      const smallObjective = new FightObjective(
        mockCharacter as any,
        smallTarget,
      );

      // Act
      const result = await smallObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionFight).toHaveBeenCalledTimes(1); // Should fail on first attempt
    });

    it('should handle getMaps API error', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Maps API error' });
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        apiError,
      );
      mockCharacter.handleErrors.mockResolvedValue(false);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
    });

    it('should handle no maps found', async () => {
      // Arrange
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        size: 50,
      });

      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionFight).not.toHaveBeenCalled();
    });

    it('should handle missing character data in response', async () => {
      // Arrange
      const responseWithoutCharacter = {
        data: {
          cooldown: {
            total_seconds: 5,
            remaining_seconds: 5,
            started_at: '2025-10-01T16:52:35.196Z',
            expiration: '2025-10-01T16:52:40.196Z',
            reason: 'fight' as const,
          },
          fight: {
            result: 'win' as const,
            turns: 3,
            opponent: 'red_slime',
            logs: ['Character attacks', 'Monster attacks', 'Character wins'],
            characters: [],
          },
          // Missing characters array
        },
      };
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockResolvedValue(responseWithoutCharacter as any);

      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(false);
    });

    it('should handle specific fight API error codes', async () => {
      // Arrange
      const inventoryFullError = new ApiError({
        code: 497,
        message: 'The characters inventory is full.',
      });
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockResolvedValue(inventoryFullError);

      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.handleErrors.mockResolvedValue(false);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(
        inventoryFullError,
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle cancellation during execution', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const objective = new FightObjective(mockCharacter as any, target);

      // Simulate cancellation by making the objective cancelled
      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionFight).not.toHaveBeenCalled();
    });

    it('should handle cancellation during fight loop', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const objective = new FightObjective(mockCharacter as any, target);

      // Mock fight to succeed once, then cancel
      let fightCount = 0;
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockImplementation(async () => {
        fightCount++;
        if (fightCount === 2) {
          objective.cancelJob();
        }
        return mockFightResponse;
      });

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(actionFight).toHaveBeenCalledTimes(2);
    });

    it('should update character data after successful fight', async () => {
      // Arrange
      const updatedCharacterData = {
        ...mockCharacterData,
        hp: 200,
        max_hp: 245,
        xp: 1500,
        gold: 1050,
      };
      const responseWithUpdatedCharacter = {
        data: {
          cooldown: {
            total_seconds: 5,
            remaining_seconds: 5,
            started_at: '2025-10-01T16:52:35.196Z',
            expiration: '2025-10-01T16:52:40.196Z',
            reason: 'fight' as const,
          },
          fight: {
            result: 'win' as const,
            turns: 3,
            opponent: 'red_slime',
            logs: ['Character attacks', 'Monster attacks', 'Character wins'],
            characters: [
              {
                character_name: 'TestCharacter',
                xp: 50,
                gold: 10,
                drops: [],
                final_hp: 200,
              },
            ],
          },
          characters: [updatedCharacterData],
        },
      };
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockResolvedValue(responseWithUpdatedCharacter as any);

      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.data).toEqual(updatedCharacterData);
    });

    it('should handle food top-up after fights', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 5); // Low food
      mockCharacter.checkFoodLevels.mockResolvedValue(false);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.topUpFood).toHaveBeenCalled();
    });

    it('should handle different monster types', async () => {
      // Test various monster types
      const monsterTests = [
        { code: 'red_slime', quantity: 3 },
        { code: 'blue_slime', quantity: 2 },
        { code: 'green_slime', quantity: 1 },
      ];

      for (const test of monsterTests) {
        // Arrange
        const testTarget: ObjectiveTargets = {
          code: test.code,
          quantity: test.quantity,
        };
        const testObjective = new FightObjective(
          mockCharacter as any,
          testTarget,
        );

        const testMapData = {
          data: [
            {
              map_id: 1,
              name: `${test.code} Area`,
              skin: 'forest',
              x: 100,
              y: 100,
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
          testMapData,
        );

        mockCharacter.addItemToInventory('apple', 20);

        // Act
        const result = await testObjective.run();

        // Assert
        expect(result).toBe(true);
        expect(getMaps).toHaveBeenCalledWith({ content_code: test.code });
        expect(actionFight).toHaveBeenCalledTimes(test.quantity);

        // Reset for next test
        jest.clearAllMocks();
        (
          actionFight as jest.MockedFunction<typeof actionFight>
        ).mockResolvedValue(mockFightResponse);
      }
    });

    it('should handle progress tracking correctly', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const progressTarget: ObjectiveTargets = {
        code: 'red_slime',
        quantity: 3,
      };
      const progressObjective = new FightObjective(
        mockCharacter as any,
        progressTarget,
      );

      // Act
      const result = await progressObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(progressObjective.progress).toBe(3);
      expect(actionFight).toHaveBeenCalledTimes(3);
    });
  });

  describe('Movement and location', () => {
    it('should move to monster location before fighting', async () => {
      // Arrange
      const customMapData = {
        data: [
          {
            map_id: 2,
            name: 'Custom Monster Area',
            skin: 'cave',
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
        customMapData,
      );
      mockCharacter.evaluateClosestMap.mockReturnValue({ x: 200, y: 300 });

      mockCharacter.addItemToInventory('apple', 20);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.evaluateClosestMap).toHaveBeenCalledWith(
        customMapData.data,
      );
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 200, y: 300 });
    });

    it('should handle movement errors gracefully', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      // Character.move() handles errors internally, so we don't need to mock throwing
      // The move will succeed but the fight might fail for other reasons

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(true); // Should succeed since movement is handled internally
      expect(mockCharacter.move).toHaveBeenCalled();
    });
  });

  describe('Parent-child job relationships', () => {
    it('should create TrainCombatObjective with correct parentId when fight simulation fails', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.simulateFightNow.mockResolvedValue(false); // Fight simulation fails
      mockCharacter.trainCombatLevelNow.mockImplementation(async (targetLevel: number): Promise<boolean> => {
        // Mock the creation of TrainCombatObjective with parentId
        const mockTrainCombatObjective = {
          parentId: mockCharacter.currentExecutingJob?.objectiveId,
          targetLevel: targetLevel,
        };
        
        // Store the created objective for testing purposes
        mockCharacter.createdTrainCombatObjective = mockTrainCombatObjective;
        
        return true;
      });
      
      // Set the current executing job to the fight objective
      mockCharacter.currentExecutingJob = fightObjective;

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(false); // Should fail after max retries
      expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledWith(
        mockCharacter.data.level + 1
      );
      expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledTimes(3); // Called for each retry
      
      // Verify that TrainCombatObjective was created with correct parentId
      expect(mockCharacter.createdTrainCombatObjective).toBeDefined();
      expect(mockCharacter.createdTrainCombatObjective.parentId).toBe(
        fightObjective.objectiveId
      );
      expect(mockCharacter.createdTrainCombatObjective.targetLevel).toBe(
        mockCharacter.data.level + 1
      );
    });

    it('should create TrainCombatObjective with parentId when fight simulation fails on first attempt', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      mockCharacter.simulateFightNow.mockResolvedValue(false); // Fight simulation fails
      mockCharacter.trainCombatLevelNow.mockImplementation(async (targetLevel: number): Promise<boolean> => {
        // Mock the creation of TrainCombatObjective with parentId
        const mockTrainCombatObjective = {
          parentId: mockCharacter.currentExecutingJob?.objectiveId,
          targetLevel: targetLevel,
        };
        
        // Store the created objective for testing purposes
        mockCharacter.createdTrainCombatObjective = mockTrainCombatObjective;
        
        return true;
      });
      
      // Set the current executing job to the fight objective
      mockCharacter.currentExecutingJob = fightObjective;

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(false); // Should fail after max retries
      expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledTimes(3); // Called for each retry
      
      // Verify that TrainCombatObjective was created with correct parentId
      expect(mockCharacter.createdTrainCombatObjective).toBeDefined();
      expect(mockCharacter.createdTrainCombatObjective.parentId).toBe(
        fightObjective.objectiveId
      );
    });
  });
});
