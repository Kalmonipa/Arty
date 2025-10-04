import { jest } from '@jest/globals';
import { GatherObjective } from '../../src/classes/GatherObjective.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import { MapSchema } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';

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
  getResourceInformation: jest.fn(),
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
  });
});
