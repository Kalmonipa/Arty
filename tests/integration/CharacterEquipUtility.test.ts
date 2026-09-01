import { jest } from '@jest/globals';
import { Character } from '../../src/character/character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import {
  BossFightPotionReserve,
  MaxEquippedUtilities,
  MinEquippedUtilities,
} from '../../src/constants.js';

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
  let bankItems: Record<string, number>;

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
      splash_restore: [],
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

    // equipUtility reads the bank through a single snapshot, both to save a
    // request per tier and to total the boss fight reserve across tiers
    bankItems = {};
    character.getAllBankItems = jest.fn(async () =>
      Object.entries(bankItems).map(([code, quantity]) => ({
        code,
        quantity,
      })),
    ) as never;

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
          // A utility slot holds a single item code: equipping a different one
          // turns the stack already there back into inventory
          if (
            character.data.utility1_slot !== '' &&
            character.data.utility1_slot !== code
          ) {
            addItemToInventory(
              character.data.utility1_slot,
              character.data.utility1_slot_quantity,
            );
            character.data.utility1_slot_quantity = 0;
          }
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
    // 40 above the boss fight reserve, so 40 is what an ordinary fight sees
    bankItems = {
      greater_health_potion: BossFightPotionReserve.restore + 40,
    };

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
    bankItems = { health_potion: BossFightPotionReserve.restore + 30 };

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.craftNow).not.toHaveBeenCalled();
    expect(character.withdrawNow).toHaveBeenCalledWith(30, 'health_potion');
    expect(result.success).toBe(true);
  });
  it('hides the boss fight reserve from an ordinary fight', async () => {
    // 20 short of the reserve: a boss fight would see all 280, this sees none
    bankItems = { greater_health_potion: BossFightPotionReserve.restore - 20 };

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.withdrawNow).not.toHaveBeenCalled();
    expect(character.equipNow).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it('gives a boss fight the whole stock, reserve included', async () => {
    bankItems = { greater_health_potion: BossFightPotionReserve.restore - 20 };

    const result = await character.equipUtility('restore', 'utility1', true);

    expect(character.withdrawNow).toHaveBeenCalledWith(
      100,
      'greater_health_potion',
    );
    expect(result.success).toBe(true);
  });

  it('counts the reserve across every tier, not per tier', async () => {
    // 200 + 130 = 330 restores banked, so 30 are spare whichever tier they are
    bankItems = {
      greater_health_potion: 200,
      health_potion: 130,
    };

    await character.equipUtility('restore', 'utility1');

    expect(character.withdrawNow).toHaveBeenCalledWith(
      30,
      'greater_health_potion',
    );
  });

  it('equips nothing when the bank snapshot fails to load', async () => {
    (character.getAllBankItems as jest.Mock).mockImplementation(
      async () => undefined,
    );

    const result = await character.equipUtility('restore', 'utility1');

    // A stale read reports nothing banked, which would look identical to a
    // reserve that is fully committed
    expect(character.withdrawNow).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
  it('keeps a usable partial stack instead of displacing it with a lower tier', async () => {
    // The state LongLegLarry span in: a full stock sits in the bank but all of
    // it is inside the boss reserve, so no tier can ever top the slot up
    character.data.utility1_slot = 'health_potion';
    character.data.utility1_slot_quantity = 40;
    addItemToInventory('greater_health_potion', 39);
    addItemToInventory('health_potion', 40);
    bankItems = { greater_health_potion: BossFightPotionReserve.restore };

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.equipNow).toHaveBeenCalledWith(
      'greater_health_potion',
      'utility1',
      39,
    );
    expect(character.equipNow).not.toHaveBeenCalledWith(
      'health_potion',
      'utility1',
      expect.anything(),
    );
    expect(character.data.utility1_slot).toBe('greater_health_potion');
    expect(result.success).toBe(true);
  });

  it('reports success once the slot holds the minimum, short of a full stack', async () => {
    addItemToInventory('greater_health_potion', MinEquippedUtilities + 1);

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.data.utility1_slot).toBe('greater_health_potion');
    expect(character.data.utility1_slot_quantity).toBe(
      MinEquippedUtilities + 1,
    );
    expect(result.success).toBe(true);
  });

  it('takes the lower tier when the higher one cannot field a usable stack', async () => {
    addItemToInventory('greater_health_potion', 5);
    addItemToInventory('health_potion', 40);

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.equipNow).toHaveBeenCalledWith(
      'health_potion',
      'utility1',
      40,
    );
    expect(character.equipNow).not.toHaveBeenCalledWith(
      'greater_health_potion',
      'utility1',
      expect.anything(),
    );
    expect(result.success).toBe(true);
  });

  it('fails without churning the slot when no tier reaches the minimum', async () => {
    addItemToInventory('greater_health_potion', 5);
    addItemToInventory('health_potion', 6);

    const result = await character.equipUtility('restore', 'utility1');

    expect(character.equipNow).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });
});
