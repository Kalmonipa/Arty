import { jest } from '@jest/globals';

const getItemInformation = jest.fn<(code: string) => Promise<unknown>>();
const actionDepositItems = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation,
  getAllItemInformation: jest.fn(async () => ({ data: [] })),
  actionEquipItem: jest.fn(),
  actionUnequipItem: jest.fn(),
  actionClaimPendingItems: jest.fn(),
  actionDeleteItem: jest.fn(),
  getPendingItems: jest.fn(async () => ({ data: [] })),
}));

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionDepositItems,
}));

import { Character } from '../../src/character/character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  ItemSchema,
  MapSchema,
  SimpleItemSchema,
} from '../../src/types/types.js';

const item = (code: string, type: string, subtype = ''): ItemSchema =>
  ({ code, name: code, level: 30, type, subtype }) as ItemSchema;

const CATALOGUE: Record<string, ItemSchema> = {
  strangold_helmet: item('strangold_helmet', 'helmet'),
  bloodblade: item('bloodblade', 'weapon'),
  emerald_ring: item('emerald_ring', 'ring'),
  mithril_shield: item('mithril_shield', 'shield'),
  gold_pickaxe: item('gold_pickaxe', 'weapon', 'tool'),
  health_potion: item('health_potion', 'utility', 'potion'),
  recall_potion: item('recall_potion', 'consumable', 'potion'),
  backpack: item('backpack', 'bag'),
  healing_rune: item('healing_rune', 'rune'),
  lost_world_map: item('lost_world_map', 'artifact'),
  ogre_skin: item('ogre_skin', 'resource'),
};

const tile = (map_id: number, type: string): MapSchema =>
  ({
    map_id,
    name: `Map_${map_id}`,
    x: 0,
    y: 0,
    interactions: { content: { type, code: type } },
  }) as MapSchema;

const BANK = tile(91, 'bank');
const FOREST = tile(500, 'resource');

const depositedItems = (): SimpleItemSchema[] =>
  (actionDepositItems.mock.calls[0]?.[1] as SimpleItemSchema[]) ?? [];

describe('depositSpareEquipment', () => {
  let character: Character;

  const carrying = (inv: Record<string, number>) => {
    character.data.inventory = Object.entries(inv).map(
      ([code, quantity], slot) => ({ slot, code, quantity }),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData, map_id: BANK.map_id });
    character.allMaps = [BANK, FOREST];
    character.itemsToKeep = [];
    getItemInformation.mockImplementation(async (code: string) => {
      const found = CATALOGUE[code];
      if (!found) throw new Error(`unexpected lookup for ${code}`);
      return found;
    });
    actionDepositItems.mockResolvedValue({ data: { character: null } });
  });

  it('banks carried gear in a single deposit action', async () => {
    carrying({ strangold_helmet: 1, bloodblade: 1, emerald_ring: 2 });

    await character.depositSpareEquipment();

    expect(actionDepositItems).toHaveBeenCalledTimes(1);
    expect(depositedItems()).toEqual([
      { code: 'strangold_helmet', quantity: 1 },
      { code: 'bloodblade', quantity: 1 },
      { code: 'emerald_ring', quantity: 2 },
    ]);
  });

  it('leaves tools alone, since they get swapped back within minutes', async () => {
    carrying({ gold_pickaxe: 1, mithril_shield: 1 });

    await character.depositSpareEquipment();

    expect(depositedItems()).toEqual([{ code: 'mithril_shield', quantity: 1 }]);
  });

  it('leaves the potion kit and non-gear alone', async () => {
    carrying({
      health_potion: 20,
      recall_potion: 1,
      ogre_skin: 15,
      bloodblade: 1,
    });

    await character.depositSpareEquipment();

    expect(depositedItems()).toEqual([{ code: 'bloodblade', quantity: 1 }]);
  });

  it('leaves runes, bags and artifacts alone', async () => {
    carrying({ backpack: 1, healing_rune: 1, lost_world_map: 1 });

    await character.depositSpareEquipment();

    expect(actionDepositItems).not.toHaveBeenCalled();
  });

  it('honours itemsToKeep so an in-flight job keeps its gear', async () => {
    carrying({ strangold_helmet: 1, bloodblade: 1 });
    character.itemsToKeep = ['bloodblade'];

    await character.depositSpareEquipment();

    expect(depositedItems()).toEqual([
      { code: 'strangold_helmet', quantity: 1 },
    ]);
  });

  it('does nothing when the character is not standing on a bank', async () => {
    character.data.map_id = FOREST.map_id;
    carrying({ strangold_helmet: 1 });

    await character.depositSpareEquipment();

    expect(actionDepositItems).not.toHaveBeenCalled();
  });

  it('does not call the API when there is no spare gear', async () => {
    carrying({ ogre_skin: 15, recall_potion: 1 });

    await character.depositSpareEquipment();

    expect(actionDepositItems).not.toHaveBeenCalled();
  });

  it('ignores empty inventory slots', async () => {
    character.data.inventory = [
      { slot: 0, code: '', quantity: 0 },
      { slot: 1, code: 'bloodblade', quantity: 0 },
      { slot: 2, code: 'mithril_shield', quantity: 1 },
    ];

    await character.depositSpareEquipment();

    expect(depositedItems()).toEqual([{ code: 'mithril_shield', quantity: 1 }]);
  });

  it('adopts the character data the deposit returns', async () => {
    carrying({ bloodblade: 1 });
    const after = { ...mockCharacterData, gold: 999 };
    actionDepositItems.mockResolvedValue({ data: { character: after } });

    await character.depositSpareEquipment();

    expect(character.data.gold).toBe(999);
  });
});
