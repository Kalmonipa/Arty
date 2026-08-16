import { jest } from '@jest/globals';
import { Character } from '../../src/character/character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { MapSchema, ItemSchema } from '../../src/types/types.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';

const potion = (code: string, level: number, mapId: number): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'consumable',
    subtype: 'potion',
    description: '',
    craft: null,
    tradeable: true,
    conditions: [],
    effects: [{ code: 'teleport', value: mapId, description: '' }],
  }) as ItemSchema;

const tile = (
  map_id: number,
  content: { type: string; code: string } | null,
): MapSchema =>
  ({
    map_id,
    name: `Map_${map_id}`,
    skin: 's',
    x: 0,
    y: 0,
    layer: 'overworld',
    access: { type: 'standard', conditions: [] },
    interactions: content ? { content } : {},
  }) as MapSchema;

const BANK = tile(91, { type: 'bank', code: 'bank' });
const FOREST = tile(500, { type: 'resource', code: 'ash_tree' });

describe('keeping a teleport potion to hand', () => {
  let character: Character;
  let withdrawNow: jest.MockedFunction<
    (quantity: number, code: string) => Promise<unknown>
  >;
  let inInventory: Record<string, number>;
  let inBank: Record<string, number>;

  beforeEach(() => {
    jest.clearAllMocks();
    inInventory = {};
    inBank = { recall_potion: 40, sandwhisper_potion: 40 };

    character = new Character({ ...mockCharacterData, map_id: BANK.map_id });
    character.allMaps = [BANK, FOREST];
    // Character is level 10 in the fixture, so sandwhisper (50) is out of reach
    character.consumablesMap = {
      heal: [],
      teleport: [
        potion('recall_potion', 5, 271),
        potion('sandwhisper_potion', 50, 1234),
      ],
    };
    character.checkQuantityOfItemInInv = jest.fn(
      (code: string) => inInventory[code] ?? 0,
    ) as never;
    character.checkQuantityOfItemInBank = jest.fn(
      async (code: string) => inBank[code] ?? 0,
    ) as never;
    withdrawNow = jest.fn(async () => ObjectiveCompleted) as never;
    character.withdrawNow = withdrawNow as never;
  });

  it('picks one up when standing at a bank with none in the bags', async () => {
    await character.topUpTeleportPotions();

    expect(withdrawNow).toHaveBeenCalledWith(1, 'recall_potion');
  });

  it('leaves the bank alone when it already carries one', async () => {
    inInventory = { recall_potion: 1 };

    await character.topUpTeleportPotions();

    expect(withdrawNow).not.toHaveBeenCalled();
  });

  it('does nothing away from a bank', async () => {
    character.data.map_id = FOREST.map_id;

    await character.topUpTeleportPotions();

    expect(withdrawNow).not.toHaveBeenCalled();
  });

  it('leaves potions it is too low a level to drink', async () => {
    await character.topUpTeleportPotions();

    expect(withdrawNow).not.toHaveBeenCalledWith(1, 'sandwhisper_potion');
  });

  it('does not withdraw what the bank does not have', async () => {
    inBank = {};

    await character.topUpTeleportPotions();

    expect(withdrawNow).not.toHaveBeenCalled();
  });

  it('does not recurse when the withdraw itself returns to the bank', async () => {
    withdrawNow.mockImplementation(async () => {
      await character.topUpTeleportPotions();
      return ObjectiveCompleted;
    });

    await character.topUpTeleportPotions();

    expect(withdrawNow).toHaveBeenCalledTimes(1);
  });
});
