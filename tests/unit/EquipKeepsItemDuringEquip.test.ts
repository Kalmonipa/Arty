import { jest } from '@jest/globals';

const actionEquipItem = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../src/api_calls/Items.js', () => ({
  actionEquipItem,
  getItemInformation: jest.fn(),
  getAllItemInformation: jest.fn(async () => ({ data: [] })),
  actionUnequipItem: jest.fn(),
  actionClaimPendingItems: jest.fn(),
  actionDeleteItem: jest.fn(),
  getPendingItems: jest.fn(async () => ({ data: [] })),
}));

import { Character } from '../../src/character/character.js';
import { EquipObjective } from '../../src/core/EquipObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

describe('EquipObjective holds its item off the spare-equipment sweep', () => {
  let character: Character;
  let keptDuringEquip: string[];

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    character.itemsToKeep = [];
    character.checkQuantityOfItemInInv = jest.fn(() => 1) as never;
    keptDuringEquip = [];
    actionEquipItem.mockImplementation(async () => {
      keptDuringEquip = [...character.itemsToKeep];
      return { data: { character: mockCharacterData } };
    });
  });

  it('keeps the item while equipping and releases it afterwards', async () => {
    const objective = new EquipObjective(character, 'bloodblade', 'weapon');

    await objective.run();

    expect(keptDuringEquip).toContain('bloodblade');
    expect(character.itemsToKeep).not.toContain('bloodblade');
  });

  it('releases the item even when the equip fails', async () => {
    actionEquipItem.mockImplementation(async () => {
      keptDuringEquip = [...character.itemsToKeep];
      throw new Error('boom');
    });
    const objective = new EquipObjective(character, 'bloodblade', 'weapon');

    await expect(objective.run()).rejects.toThrow('boom');

    expect(keptDuringEquip).toContain('bloodblade');
    expect(character.itemsToKeep).not.toContain('bloodblade');
  });

  it('leaves an entry an outer job already made in place', async () => {
    character.itemsToKeep = ['bloodblade'];
    const objective = new EquipObjective(character, 'bloodblade', 'weapon');

    await objective.run();

    expect(character.itemsToKeep).toContain('bloodblade');
  });
});
