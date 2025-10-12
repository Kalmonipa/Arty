import { jest } from '@jest/globals';
import { GatherObjective } from '../../src/objectives/GatherObjective.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { MapSchema, ItemSchema } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';

// Import the mocked functions
import { getItemInformation } from '../../src/api_calls/Items.js';
import { getAllResourceInformation } from '../../src/api_calls/Resources.js';
import { getMaps } from '../../src/api_calls/Maps.js';

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

  checkQuantityOfItemInBank = jest.fn(async (): Promise<number> => {
    return 0;
  });

  withdrawNow = jest.fn(async (): Promise<boolean> => {
    return true;
  });

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
  });

  describe('Basic functionality', () => {
    it('should return true when target quantity is already in inventory', async () => {
      // Arrange
      mockCharacter.addItemToInventory('iron_ore', 15);

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
      expect(mockCharacter.withdrawNow).toHaveBeenCalledWith(10, 'iron_ore');
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
});
