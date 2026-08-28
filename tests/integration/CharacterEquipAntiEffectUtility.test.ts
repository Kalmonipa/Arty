import { jest } from '@jest/globals';
import { Character } from '../../src/character/character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';

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
      splash_restore: [],
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
      async (quantity: number, code: string): Promise<ObjectiveResult> => {
        // Simulate adding item to inventory
        addItemToInventory(code, quantity);
        return ObjectiveCompleted;
      },
    ) as jest.MockedFunction<
      (quantity: number, code: string) => Promise<ObjectiveResult>
    >;

    character.equipNow = jest.fn(
      async (
        code: string,
        slot: string,
        quantity?: number,
      ): Promise<ObjectiveResult> => {
        if (slot === 'utility2') {
          character.data.utility2_slot = code;
          character.data.utility2_slot_quantity =
            (character.data.utility2_slot_quantity || 0) + (quantity || 1);
        }
        return ObjectiveCompleted;
      },
    ) as jest.MockedFunction<
      (
        code: string,
        slot: string,
        quantity?: number,
      ) => Promise<ObjectiveResult>
    >;

    character.craftNow = jest.fn(
      async (quantity: number, code: string): Promise<ObjectiveResult> => {
        // Simulate crafting by adding to inventory
        addItemToInventory(code, quantity);
        return ObjectiveCompleted;
      },
    ) as jest.MockedFunction<
      (quantity: number, code: string) => Promise<ObjectiveResult>
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

  const weakAntidote = () => character.utilitiesMap.antipoison[0];
  const antidote = () => character.utilitiesMap.antipoison[1];

  describe('Topping up the slot', () => {
    it('equips the utility it was given out of the inventory', async () => {
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('antidote', 100);

      const result = await character.equipAntiEffectUtility(
        antidote(),
        'utility2',
      );

      expect(character.equipNow).toHaveBeenCalledWith(
        'antidote',
        'utility2',
        100,
      );
      expect(result.success).toBe(true);
    });

    it('equips a tier that counters less than the mob inflicts', async () => {
      // The fight simulation decides which tier wins; this method carries out
      // that decision rather than second-guessing it on the numbers
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100);

      const result = await character.equipAntiEffectUtility(
        weakAntidote(),
        'utility2',
      );

      expect(character.equipNow).toHaveBeenCalledWith(
        'weak_antidote',
        'utility2',
        100,
      );
      expect(result.success).toBe(true);
    });

    it('never reaches for a tier other than the one it was given', async () => {
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('weak_antidote', 100);
      (character as any).addItemToInventory('antidote', 100);

      await character.equipAntiEffectUtility(antidote(), 'utility2');

      expect(character.checkQuantityOfItemInInv).not.toHaveBeenCalledWith(
        'weak_antidote',
      );
    });

    it('tops up only what the slot is short of', async () => {
      character.data.utility2_slot_quantity = 40;
      (character as any).addItemToInventory('antidote', 100);

      await character.equipAntiEffectUtility(antidote(), 'utility2');

      expect(character.equipNow).toHaveBeenCalledWith(
        'antidote',
        'utility2',
        60,
      );
    });
  });

  describe('Bank withdrawal', () => {
    it('withdraws from the bank when the inventory is short', async () => {
      character.data.utility2_slot_quantity = 50;
      character.checkQuantityOfItemInBank = jest.fn(
        async () => 50,
      ) as jest.MockedFunction<(code: string) => Promise<number>>;

      const result = await character.equipAntiEffectUtility(
        antidote(),
        'utility2',
      );

      expect(character.withdrawNow).toHaveBeenCalledWith(50, 'antidote');
      expect(result.success).toBe(true);
    });

    it('takes only what the bank has when it cannot fill the slot', async () => {
      character.data.utility2_slot_quantity = 0;
      character.checkQuantityOfItemInBank = jest.fn(
        async () => 30,
      ) as jest.MockedFunction<(code: string) => Promise<number>>;

      await character.equipAntiEffectUtility(antidote(), 'utility2');

      expect(character.withdrawNow).toHaveBeenCalledWith(30, 'antidote');
    });

    it('uses what it carries and makes the rest up from the bank', async () => {
      character.data.utility2_slot_quantity = 0;
      (character as any).addItemToInventory('antidote', 30);
      character.checkQuantityOfItemInBank = jest.fn(
        async () => 70,
      ) as jest.MockedFunction<(code: string) => Promise<number>>;

      await character.equipAntiEffectUtility(antidote(), 'utility2');

      expect(character.equipNow).toHaveBeenCalledWith(
        'antidote',
        'utility2',
        30,
      );
      expect(character.withdrawNow).toHaveBeenCalledWith(70, 'antidote');
    });
  });

  describe('No crafting on the fight path', () => {
    it('does not craft when the tier is in neither inventory nor bank', async () => {
      character.data.utility2_slot_quantity = 0;

      const result = await character.equipAntiEffectUtility(
        antidote(),
        'utility2',
      );

      expect(character.craftNow).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it('does not craft even when alchemy could make the tier', async () => {
      character.data.alchemy_level = 50;
      character.data.utility2_slot_quantity = 0;

      await character.equipAntiEffectUtility(antidote(), 'utility2');

      expect(character.craftNow).not.toHaveBeenCalled();
    });
  });
});
