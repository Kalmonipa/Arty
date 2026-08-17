import { jest } from '@jest/globals';
import { Character } from '../../src/character/character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { MaxEquippedUtilities } from '../../src/constants.js';

jest.mock('../../src/api_calls/Items', () => ({
  actionEquipItem: jest.fn(),
  actionUse: jest.fn(),
  getItemInformation: jest.fn(),
  getAllItemInformation: jest.fn(),
}));

jest.mock('../../src/core/CraftObjective', () => ({
  CraftObjective: jest.fn(),
}));

const createRestorePotion = (
  code: string,
  name: string,
  level: number,
): ItemSchema => ({
  code,
  name,
  level,
  type: 'utility',
  subtype: 'potion',
  description: '',
  craft: { skill: 'alchemy', level, items: [], quantity: 1 },
  tradeable: true,
  conditions: [],
  effects: [{ code: 'restore', value: level * 10, description: 'Restores hp' }],
});

describe('Character.equipUtility', () => {
  let character: Character;

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

  beforeEach(() => {
    jest.clearAllMocks();

    character = new Character(JSON.parse(JSON.stringify(mockCharacterData)));
    character.role = 'healer';
    character.data.level = 30;
    character.data.alchemy_level = 30;
    character.data.utility1_slot = '';
    character.data.utility1_slot_quantity = 0;

    character.utilitiesMap = {
      antipoison: [],
      restore: [
        createRestorePotion('health_potion', 'Health Potion', 20),
        createRestorePotion(
          'greater_health_potion',
          'Greater Health Potion',
          30,
        ),
      ],
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

    character.checkQuantityOfItemInInv = jest.fn((code: string): number => {
      const item = character.data.inventory.find(
        (item: InventorySlot) => item.code === code,
      );
      return item ? item.quantity : 0;
    }) as jest.MockedFunction<(code: string) => number>;

    character.checkQuantityOfItemInBank = jest.fn(
      async (): Promise<number> => 0,
    ) as jest.MockedFunction<(code: string) => Promise<number>>;

    character.withdrawNow = jest.fn(
      async (quantity: number, code: string): Promise<ObjectiveResult> => {
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
        if (slot === 'utility1') {
          character.data.utility1_slot = code;
          character.data.utility1_slot_quantity =
            (character.data.utility1_slot_quantity || 0) + (quantity || 1);
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
        addItemToInventory(code, quantity);
        return ObjectiveCompleted;
      },
    ) as jest.MockedFunction<
      (quantity: number, code: string) => Promise<ObjectiveResult>
    >;

    character.getCharacterLevel = jest.fn(
      (char: CharacterSchema, skillName?: string): number =>
        skillName === 'alchemy' ? char.alchemy_level : char.level,
    ) as jest.MockedFunction<
      (char: CharacterSchema, skillName?: string) => number
    >;
  });

  it('equips potions already carried in the inventory', async () => {
    addItemToInventory('health_potion', MaxEquippedUtilities);

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.equipNow).toHaveBeenCalledWith(
      'health_potion',
      'utility1',
      MaxEquippedUtilities,
    );
    expect(character.craftNow).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('withdraws potions from the bank when the inventory is short', async () => {
    (
      character.checkQuantityOfItemInBank as jest.MockedFunction<
        (code: string) => Promise<number>
      >
    ).mockResolvedValue(40);

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.withdrawNow).toHaveBeenCalledWith(
      40,
      'greater_health_potion',
    );
    expect(character.equipNow).toHaveBeenCalledWith(
      'greater_health_potion',
      'utility1',
      40,
    );
    expect(character.craftNow).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('never crafts potions, even for a healer with nothing in inventory or bank', async () => {
    const result = await character.equipUtility('restore', 'utility1');

    expect(character.craftNow).not.toHaveBeenCalled();
    expect(character.equipNow).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('never crafts potions for an alchemist either', async () => {
    character.role = 'alchemist';

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.craftNow).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('falls back to a lesser potion held in the bank rather than crafting the best one', async () => {
    (
      character.checkQuantityOfItemInBank as jest.MockedFunction<
        (code: string) => Promise<number>
      >
    ).mockImplementation(async (code: string) =>
      code === 'health_potion' ? 30 : 0,
    );

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.craftNow).not.toHaveBeenCalled();
    expect(character.withdrawNow).toHaveBeenCalledWith(30, 'health_potion');
    expect(result.success).toBe(true);
  });
});
