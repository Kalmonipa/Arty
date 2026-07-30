import { jest } from '@jest/globals';
import { FightObjective } from '../../src/core/FightObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { ApiError } from '../../src/core/Error.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { HealthStatus } from '../../src/types/CharacterData.js';

// Mock the API modules
jest.mock('../../src/api_calls/Actions', () => ({
  actionFight: jest.fn(),
}));

jest.mock('../../src/api_calls/Monsters', () => ({
  getMonsterInformation: jest.fn(),
}));

// Import the mocked functions
import { actionFight } from '../../src/api_calls/Actions.js';
import { getMonsterInformation } from '../../src/api_calls/Monsters.js';
import { CharacterSchema, ItemSlot, Skill } from '../../src/types/types.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  minEquippedUtilities = 5;
  currentExecutingJob?: { objectiveId: string };
  createdTrainCombatObjective?: { parentId?: string; targetLevel: number };

  utilitiesMap = {
    restore: [
      {
        name: 'Small Health Potion',
        code: 'small_health_potion',
        level: 5,
        type: 'utility',
        subtype: 'potion',
        description:
          'A compact potion that restores a bit of health when most needed. Fits in any pocket.',
        conditions: [
          {
            code: 'level',
            operator: 'gt',
            value: 4,
          },
        ],
        effects: [
          {
            code: 'restore',
            value: 30,
            description:
              'Restores 30 HP at the start of the turn if the player has lost more than 50% of their health points.',
          },
        ],
        craft: {
          skill: 'alchemy',
          level: 5,
          items: [
            {
              code: 'sunflower',
              quantity: 3,
            },
          ],
          quantity: 1,
        },
        tradeable: true,
      },
      {
        name: 'Minor Health Potion',
        code: 'minor_health_potion',
        level: 20,
        type: 'utility',
        subtype: 'potion',
        description:
          'A small but effective potion. Restores a fair amount of health in a pinch.',
        conditions: [
          {
            code: 'level',
            operator: 'gt',
            value: 19,
          },
        ],
        effects: [
          {
            code: 'restore',
            value: 70,
            description:
              'Restores 70 HP at the start of the turn if the player has lost more than 50% of their health points.',
          },
        ],
        craft: {
          skill: 'alchemy',
          level: 20,
          items: [
            {
              code: 'nettle_leaf',
              quantity: 2,
            },
            {
              code: 'algae',
              quantity: 1,
            },
          ],
          quantity: 1,
        },
        tradeable: true,
      },
    ],
  };

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

  equipNow = jest.fn(
    async (
      itemName: string,
      itemSlot: ItemSlot,
      quantity?: number,
    ): Promise<boolean> => {
      this.data.weapon_slot = itemName;
      return true;
    },
  );

  unequipNow = jest.fn(
    async (itemSlot: ItemSlot, quantity: number): Promise<boolean> => {
      this.data.utility1_slot = '';
      this.data.utility1_slot_quantity = 0;
      return true;
    },
  );

  depositNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      // Mock successful deposit
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

  move = jest.fn(
    async (destination: { x: number; y: number }): Promise<void> => {
      this.data.x = destination.x;
      this.data.y = destination.y;
    },
  );

  evaluateClosestMap = jest.fn((maps: any[]): { x: number; y: number } => {
    return { x: maps[0].x, y: maps[0].y };
  });

  findMaps = jest.fn((): any[] => mockMapData.data);

  evaluateDepositItemsInBank = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  checkFoodLevels = jest.fn(async (): Promise<boolean> => {
    // Mock implementation - check if we have any food in inventory
    return this.data.inventory.some(
      (item: InventorySlot) => item.quantity > 10,
    );
  });

  findFoodInInventory = jest.fn(
    (): { code: string; quantity: number; healValue: number }[] => {
      // Mock implementation - return some food items
      return this.data.inventory
        .filter((item: InventorySlot) => item.quantity > 0)
        .map((item: InventorySlot) => ({
          code: item.code,
          quantity: item.quantity,
          healValue: 50, // Mock heal value
        }));
    },
  );

  findFoodInBank = jest.fn(
    async (): Promise<
      { code: string; quantity: number; healValue: number }[]
    > => {
      // Mock implementation - return empty array for bank
      return [];
    },
  );

  findBestFood = jest.fn(
    async (): Promise<{
      code: string;
      quantity: number;
      healValue: number;
      source: 'inventory' | 'bank';
    } | null> => {
      const inventoryFood = this.findFoodInInventory();
      if (inventoryFood.length > 0) {
        return { ...inventoryFood[0], source: 'inventory' as const };
      }
      return null;
    },
  );

  getCharacterLevel = jest.fn(
    (char?: CharacterSchema, skillName?: Skill): number => {
      switch (skillName) {
        case 'alchemy':
          return 12;
        default:
          return 14;
      }
    },
  );

  withdrawFoodIfNeeded = jest.fn(async (): Promise<boolean> => {
    // Mock implementation
    return true;
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

  trainCombatLevelNow = jest.fn(
    async (targetLevel: number): Promise<boolean> => {
      // Mock the creation of TrainCombatObjective with parentId
      const mockTrainCombatObjective = {
        parentId: this.currentExecutingJob?.objectiveId,
        targetLevel: targetLevel,
      };

      // Store the created objective for testing purposes
      this.createdTrainCombatObjective = mockTrainCombatObjective;

      return true;
    },
  );

  checkHealth = jest.fn((): HealthStatus => {
    return {
      percentage: 100,
      difference: 0,
    };
  });

  rest = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  recoverHealth = jest.fn(async (): Promise<boolean> => {
    return true;
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

  createFakeCharacterSchema = jest.fn((charData: any): any => {
    return { ...charData };
  });

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

const mockLossResponse = {
  data: {
    cooldown: {
      total_seconds: 5,
      remaining_seconds: 5,
      started_at: '2025-10-01T16:52:35.196Z',
      expiration: '2025-10-01T16:52:40.196Z',
      reason: 'fight' as const,
    },
    fight: {
      result: 'loss' as const,
      turns: 10,
      opponent: 'red_slime',
      logs: ['Character attacks', 'Monster attacks', 'Character loses'],
      characters: [],
    },
    characters: [
      {
        ...mockCharacterData,
        hp: 0,
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
  pages: 1,
  size: 50,
};

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
    drops: [
      {
        code: 'red_slimeball',
        rate: 10,
        min_quantity: 1,
        max_quantity: 1,
      },
      {
        code: 'apple',
        rate: 12,
        min_quantity: 1,
        max_quantity: 1,
      },
    ],
  },
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
    mockCharacter.findMaps.mockReturnValue(mockMapData.data);
    (actionFight as jest.MockedFunction<typeof actionFight>).mockResolvedValue(
      mockFightResponse,
    );
    (
      getMonsterInformation as jest.MockedFunction<typeof getMonsterInformation>
    ).mockResolvedValue(mockMonsterData);
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
      expect(mockCharacter.findMaps).toHaveBeenCalledWith({
        content_code: 'red_slime',
      });
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
      //expect(mockCharacter.checkFoodLevels).toHaveBeenCalled();
      expect(mockCharacter.evaluateGear).toHaveBeenCalled();
      //expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
    });
  });

  describe('Health management', () => {
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
      expect(mockCharacter.recoverHealth).toHaveBeenCalled();
    });

    it('should call recoverHealth to check health and recover if needed', async () => {
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
      expect(mockCharacter.recoverHealth).toHaveBeenCalled();
    });
  });

  describe('Utility1 management', () => {
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
      mockCharacter.data.utility1_slot_quantity = 30; // Above minEquippedUtilities

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

  // ToDo: Get the antipoison tests working
  // describe('Utility2 management', () => {
  //   it('should equip antidotes if monster has poison effect', async () => {
  //     mockCharacter.data.utility2_slot_quantity = 0;
  //     mockCharacter.equipUtility.mockResolvedValue(true);

  //     const result = await fightObjective.runPrerequisiteChecks();

  //     expect(result).toBe(true);
  //     expect(mockCharacter.equipUtility).toHaveBeenCalledWith('antipoison', 'utility2')
  //   })
  // })

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

    it('should handle no maps found', async () => {
      // Arrange
      mockCharacter.findMaps.mockReturnValue([]);

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
          pages: 1,
          size: 50,
        };
        mockCharacter.findMaps.mockReturnValue(testMapData.data);

        mockCharacter.addItemToInventory('apple', 20);

        // Act
        const result = await testObjective.run();

        // Assert
        expect(result).toBe(true);
        expect(mockCharacter.findMaps).toHaveBeenCalledWith({
          content_code: test.code,
        });
        expect(actionFight).toHaveBeenCalledTimes(test.quantity);

        // Reset for next test
        jest.clearAllMocks();
        (
          actionFight as jest.MockedFunction<typeof actionFight>
        ).mockResolvedValue(mockFightResponse);
      }
    });

    it('should stop fighting and return false after 3 consecutive losses', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      (
        actionFight as jest.MockedFunction<typeof actionFight>
      ).mockResolvedValue(mockLossResponse as any);

      // Act
      const result = await fightObjective.run();

      // Assert
      expect(result).toBe(false);
      expect(fightObjective.lostTooManyFights).toBe(true);
      expect(actionFight).toHaveBeenCalledTimes(3);
    });

    it('should not count lost fights toward progress', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const lossTarget: ObjectiveTargets = { code: 'red_slime', quantity: 2 };
      const lossObjective = new FightObjective(
        mockCharacter as any,
        lossTarget,
      );
      // lose twice, then win the two required fights
      (actionFight as jest.MockedFunction<typeof actionFight>)
        .mockResolvedValueOnce(mockLossResponse as any)
        .mockResolvedValueOnce(mockLossResponse as any)
        .mockResolvedValue(mockFightResponse);

      // Act
      const result = await lossObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(lossObjective.progress).toBe(2);
      expect(actionFight).toHaveBeenCalledTimes(4); // 2 losses + 2 wins
    });

    it('should reset the loss counter after a win', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const resetTarget: ObjectiveTargets = { code: 'red_slime', quantity: 3 };
      const resetObjective = new FightObjective(
        mockCharacter as any,
        resetTarget,
      );
      // Interleave losses and wins so it never loses 3 in a row
      (actionFight as jest.MockedFunction<typeof actionFight>)
        .mockResolvedValueOnce(mockLossResponse as any)
        .mockResolvedValueOnce(mockFightResponse)
        .mockResolvedValueOnce(mockLossResponse as any)
        .mockResolvedValueOnce(mockFightResponse)
        .mockResolvedValueOnce(mockLossResponse as any)
        .mockResolvedValueOnce(mockFightResponse);

      // Act
      const result = await resetObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(resetObjective.lostTooManyFights).toBe(false);
      expect(resetObjective.progress).toBe(3);
      expect(actionFight).toHaveBeenCalledTimes(6);
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
        pages: 1,
        size: 50,
      };
      mockCharacter.findMaps.mockReturnValue(customMapData.data);
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

  describe('Monster type handling', () => {
    it('should run fight simulation for normal monsters', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const normalMonsterData = {
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
        },
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(normalMonsterData);

      // Act
      const result = await fightObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
    });

    it('should skip fight simulation for boss monsters with no participants', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const bossMonsterData = {
        data: {
          name: 'Dragon Boss',
          code: 'dragon_boss',
          level: 50,
          type: 'boss' as const,
          hp: 5000,
          attack_fire: 100,
          attack_earth: 0,
          attack_water: 0,
          attack_air: 0,
          res_fire: 50,
          res_earth: 0,
          res_water: 0,
          res_air: 0,
          critical_strike: 0,
          initiative: 100,
          effects: [],
          min_gold: 0,
          max_gold: 5,
          drops: [],
        },
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(bossMonsterData);

      const bossTarget: ObjectiveTargets = {
        code: 'dragon_boss',
        quantity: 1,
      };
      const bossObjective = new FightObjective(
        mockCharacter as any,
        bossTarget,
        //['testchar1', 'testChar2'],
      );

      // Act
      const result = await bossObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.simulateFightNow).not.toHaveBeenCalled();
    });

    it('should run fight simulation for elite monsters', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const eliteMonsterData = {
        data: {
          name: 'Elite Orc',
          code: 'elite_orc',
          level: 25,
          type: 'elite' as const,
          hp: 1000,
          attack_fire: 50,
          attack_earth: 0,
          attack_water: 0,
          attack_air: 0,
          res_fire: 30,
          res_earth: 0,
          res_water: 0,
          res_air: 0,
          critical_strike: 0,
          initiative: 100,
          effects: [],
          min_gold: 0,
          max_gold: 5,
          drops: [],
        },
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(eliteMonsterData);

      const eliteTarget: ObjectiveTargets = {
        code: 'elite_orc',
        quantity: 1,
      };
      const eliteObjective = new FightObjective(
        mockCharacter as any,
        eliteTarget,
      );

      // Act
      const result = await eliteObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.simulateFightNow).toHaveBeenCalled();
    });

    it('should return false if attempting to fight boss alone', async () => {
      // Arrange
      mockCharacter.addItemToInventory('apple', 20);
      const bossMonsterData = {
        data: {
          name: 'Dragon Boss',
          code: 'dragon_boss',
          level: 50,
          type: 'boss' as const,
          hp: 5000,
          attack_fire: 100,
          attack_earth: 0,
          attack_water: 0,
          attack_air: 0,
          res_fire: 50,
          res_earth: 0,
          res_water: 0,
          res_air: 0,
          critical_strike: 0,
          initiative: 100,
          effects: [],
          min_gold: 0,
          max_gold: 5,
          drops: [],
        },
      };
      (
        getMonsterInformation as jest.MockedFunction<
          typeof getMonsterInformation
        >
      ).mockResolvedValue(bossMonsterData);

      const eliteTarget: ObjectiveTargets = {
        code: 'elite_orc',
        quantity: 1,
      };
      const eliteObjective = new FightObjective(
        mockCharacter as any,
        eliteTarget,
      );

      // Act
      const result = await eliteObjective.runPrerequisiteChecks();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.simulateFightNow).not.toHaveBeenCalled();
    });
  });

  //describe('Parent-child job relationships', () => {
  // it('should create TrainCombatObjective with correct parentId when fight simulation fails', async () => {
  //   // Arrange
  //   mockCharacter.addItemToInventory('apple', 20);
  //   mockCharacter.simulateFightNow.mockResolvedValue(false); // Fight simulation fails
  //   mockCharacter.trainCombatLevelNow.mockImplementation(
  //     async (targetLevel: number): Promise<boolean> => {
  //       // Mock the creation of TrainCombatObjective with parentId
  //       const mockTrainCombatObjective = {
  //         parentId: mockCharacter.currentExecutingJob?.objectiveId,
  //         targetLevel: targetLevel,
  //       };

  //       // Store the created objective for testing purposes
  //       mockCharacter.createdTrainCombatObjective = mockTrainCombatObjective;

  //       return true;
  //     },
  //   );

  //   // Set the current executing job to the fight objective
  //   mockCharacter.currentExecutingJob = fightObjective;

  //   // Act
  //   const result = await fightObjective.runPrerequisiteChecks();

  //   // Assert
  //   expect(result).toBe(true);
  //   // expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledWith(
  //   //   mockCharacter.data.level + 1,
  //   // );
  //   // expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledTimes(1);

  //   // Verify that TrainCombatObjective was created with correct parentId
  //   expect(mockCharacter.createdTrainCombatObjective).toBeDefined();
  //   expect(mockCharacter.createdTrainCombatObjective.parentId).toBe(
  //     fightObjective.objectiveId,
  //   );
  //   expect(mockCharacter.createdTrainCombatObjective.targetLevel).toBe(
  //     mockCharacter.data.level + 1,
  //   );
  // });

  // it('should create TrainCombatObjective with parentId when fight simulation fails on first attempt', async () => {
  //   // Arrange
  //   mockCharacter.addItemToInventory('apple', 20);

  //   mockCharacter.simulateFightNow.mockResolvedValue(false); // Fight simulation fails
  //   mockCharacter.trainCombatLevelNow.mockImplementation(
  //     async (targetLevel: number): Promise<boolean> => {
  //       // Mock the creation of TrainCombatObjective with parentId
  //       const mockTrainCombatObjective = {
  //         parentId: mockCharacter.currentExecutingJob?.objectiveId,
  //         targetLevel: targetLevel,
  //       };

  //       // Store the created objective for testing purposes
  //       mockCharacter.createdTrainCombatObjective = mockTrainCombatObjective;

  //       return true;
  //     },
  //   );

  //   // Set the current executing job to the fight objective
  //   mockCharacter.currentExecutingJob = fightObjective;

  //   // Act
  //   const result = await fightObjective.runPrerequisiteChecks();

  //   // Assert
  //   expect(result).toBe(false); // Should fail after max retries
  //   expect(mockCharacter.trainCombatLevelNow).toHaveBeenCalledTimes(1); // Called once when simulation fails

  //   // Verify that TrainCombatObjective was created with correct parentId
  //   expect(mockCharacter.createdTrainCombatObjective).toBeDefined();
  //   expect(mockCharacter.createdTrainCombatObjective.parentId).toBe(
  //     fightObjective.objectiveId,
  //   );
  // });
  //});
});
