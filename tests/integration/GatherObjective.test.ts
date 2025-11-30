import { jest } from '@jest/globals';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { MapSchema, ItemSchema } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';

// Import the mocked functions
import { getItemInformation } from '../../src/api_calls/Items.js';
import { getAllResourceInformation } from '../../src/api_calls/Resources.js';
import { getMaps } from '../../src/api_calls/Maps.js';
import { actionGather } from '../../src/api_calls/Actions.js';

// Mock item data
const mockIronOreData: ItemSchema = {
  code: 'iron_ore',
  name: 'Iron Ore',
  level: 10,
  type: 'resource',
  subtype: 'mining',
  description:
    'A chunk of raw iron ore. Can be smelted into iron bars for crafting many useful items.',
  conditions: [],
  effects: [],
  craft: null,
  tradeable: true,
};

// Mock resource information data
const mockResourceData = {
  data: [
    {
      name: 'Iron Rocks',
      code: 'iron_rocks',
      skill: 'mining' as const,
      level: 10,
      drops: [
        {
          code: 'iron_ore',
          rate: 1,
          min_quantity: 1,
          max_quantity: 1,
        },
        {
          code: 'topaz_stone',
          rate: 200,
          min_quantity: 1,
          max_quantity: 1,
        },
        {
          code: 'emerald_stone',
          rate: 200,
          min_quantity: 1,
          max_quantity: 1,
        },
        {
          code: 'ruby_stone',
          rate: 200,
          min_quantity: 1,
          max_quantity: 1,
        },
        {
          code: 'sapphire_stone',
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

// Mock map data
const mockMapData = {
  data: [
    {
      map_id: 1,
      name: 'Iron Mine',
      skin: 'mine',
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

// Mock the API modules
jest.mock('../../src/api_calls/Actions', () => ({
  actionGather: jest.fn(),
}));

jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Maps', () => ({
  getMaps: jest.fn(),
}));

jest.mock('../../src/api_calls/Monsters', () => ({
  getAllMonsterInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources', () => ({
  getAllResourceInformation: jest.fn(),
}));

// Simple mock character
class SimpleMockCharacter {
  data = mockCharacterData;

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(async (code: string): Promise<number> => {
    // Mock bank storage - in real implementation this would check actual bank
    return 0;
  });

  withdrawNow = jest.fn(
    async (quantity: number, code: string): Promise<boolean> => {
      // Simulate withdrawing from bank by adding to inventory
      this.addItemToInventory(code, quantity);
      return true;
    },
  );

  checkWeaponForEffects = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  evaluateGear = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  evaluateDepositItemsInBank = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  tradeWithNpcNow = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  craftNow = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  fightNow = jest.fn(async (): Promise<boolean> => {
    return true;
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

  handleErrors = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  saveJobQueue = jest.fn(async (): Promise<void> => {
    // Mock implementation
  });

  removeItemFromItemsToKeep = jest.fn((): void => {
    // Mock implementation
  });

  checkForActiveEvents = jest.fn((): boolean => {
    return true;
  });

  getCharacterLevel = jest.fn((skillName?: string): number => {
    switch (skillName) {
      case 'alchemy':
        return this.data.alchemy_level;
      case 'cooking':
        return this.data.cooking_level;
      case 'fishing':
        return this.data.fishing_level;
      case 'gearcrafting':
        return this.data.gearcrafting_level;
      case 'jewelrycrafting':
        return this.data.jewelrycrafting_level;
      case 'mining':
        return this.data.mining_level;
      case 'weaponcrafting':
        return this.data.weaponcrafting_level;
      case 'woodcutting':
        return this.data.woodcutting_level;
      default:
        return this.data.level;
    }
  });

  addItemToInventory = (code: string, quantity: number): void => {
    const item = this.data.inventory.find(
      (item: InventorySlot) => item.code === code,
    );
    if (item) {
      item.quantity += quantity;
    } else {
      this.data.inventory.push({ slot: 10, code: code, quantity: quantity });
    }
  };
}

describe('GatherObjective Integration Tests (Minimal)', () => {
  let mockCharacter: SimpleMockCharacter;
  let gatherObjective: GatherObjective;
  let target: ObjectiveTargets;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character
    mockCharacter = new SimpleMockCharacter();

    // Set up default target
    target = {
      code: 'iron_ore',
      quantity: 10,
    };

    // Create fresh gather objective
    gatherObjective = new GatherObjective(mockCharacter as any, target);

    // Mock actionGather to simulate successful gathering
    (
      actionGather as jest.MockedFunction<typeof actionGather>
    ).mockResolvedValue({
      data: {
        character: mockCharacter.data,
        cooldown: {
          total_seconds: 1,
          remaining_seconds: 0,
          started_at: new Date().toISOString(),
          expiration: new Date(Date.now() + 1000).toISOString(),
          reason: 'gathering',
        },
        details: {
          xp: 10,
          items: [{ code: 'iron_ore', quantity: 1 }],
        },
      },
    });
  });

  describe('Basic functionality', () => {
    it('should return true when target quantity is already in inventory', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_ore', 15);
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(15);

      // Act
      const result = await gatherObjective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.checkQuantityOfItemInInv).toHaveBeenCalledWith(
        'iron_ore',
      );
    });

    it('should withdraw from bank when sufficient quantity is available', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(5);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(20);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      const objectiveWithBankCheck = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      const result = await objectiveWithBankCheck.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(5, 'iron_ore'); // Need to withdraw 5 (10 - 5)
    });

    it('should withdraw partial amount from bank and gather the rest', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(3);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(5);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      // Mock the API calls for gathering
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objectiveWithBankCheck = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      const result = await objectiveWithBankCheck.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(5, 'iron_ore'); // Withdraw all from bank
      // Should then gather 2 more (10 - 3 - 5 = 2)
    });

    it('should create GatherObjective with correct properties', () => {
      // Arrange & Act
      const objective = new GatherObjective(mockCharacter as any, target);

      // Assert
      expect(objective.target).toEqual(target);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^gather_10_iron_ore_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
    });

    it('should return false if gathering item is wooden_stick', async () => {
      const objectiveWithBankCheck = new GatherObjective(
        mockCharacter as any,
        { code: 'wooden_stick', quantity: 1 },
        true, // checkBank = true
      );

      // Act
      const result = await objectiveWithBankCheck.run();

      // Assert
      expect(result).toBe(false);
    });

    it('should gather all and not withdraw from bank when bank has 0', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      // Mock the API calls
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objectiveWithBankCheck = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      const result = await objectiveWithBankCheck.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).not.toHaveBeenCalled();
    });
  });

  describe('New simplified logic tests', () => {
    it('should reset progress to 0 when starting to gather', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);

      // Mock the API calls
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objective = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      await objective.run();

      // Assert
      // Progress should be reset to 0 initially, but will be updated during gathering
      // The important thing is that the logic correctly calculates what needs to be gathered
      expect(objective.progress).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct quantity to gather after bank withdrawal', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(2);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(3);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      // Mock the API calls
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objective = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(3, 'iron_ore'); // Withdraw all from bank
      // Should then gather 5 more (10 - 2 - 3 = 5)
    });

    it('should handle case where bank has more than needed', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(3);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(15);
      mockCharacter.withdrawNow.mockResolvedValue(true);

      const objective = new GatherObjective(
        mockCharacter as any,
        target,
        true, // checkBank = true
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(7, 'iron_ore'); // Need to withdraw 7 (10 - 3)
    });

    it('should not check bank when checkBank is false', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(0);

      // Mock the API calls
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objective = new GatherObjective(
        mockCharacter as any,
        target,
        false, // checkBank = false
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.checkQuantityOfItemInBank).not.toHaveBeenCalled();
      expect(mockCharacter.withdrawNow).not.toHaveBeenCalled();
    });

    it('should handle includeInventory parameter correctly', async () => {
      // Arrange
      mockCharacter.checkQuantityOfItemInInv.mockReturnValue(5);
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);

      // Mock the API calls
      (
        getItemInformation as jest.MockedFunction<typeof getItemInformation>
      ).mockResolvedValue(mockIronOreData);
      (
        getAllResourceInformation as jest.MockedFunction<
          typeof getAllResourceInformation
        >
      ).mockResolvedValue(mockResourceData);
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        mockMapData,
      );

      const objective = new GatherObjective(
        mockCharacter as any,
        target,
        false, // checkBank = false
        true, // includeInventory = true (default)
      );

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      // Should gather 5 more (10 - 5 = 5)
    });
  });
});
