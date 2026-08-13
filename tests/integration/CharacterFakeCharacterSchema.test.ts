import { jest } from '@jest/globals';
import { Character } from '../../src/character/CharacterClass.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

jest.mock('../../src/api_calls/Items', () => ({
  actionEquipItem: jest.fn(),
  actionUse: jest.fn(),
  getItemInformation: jest.fn(),
  getAllItemInformation: jest.fn(),
}));

jest.mock('../../src/core/CraftObjective', () => ({
  CraftObjective: jest.fn(),
}));

describe('Character.createFakeCharacterSchema', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character(JSON.parse(JSON.stringify(mockCharacterData)));
  });

  it('carries the equipped gear across', () => {
    character.data.weapon_slot = 'iron_sword';
    character.data.helmet_slot = 'iron_helm';
    character.data.artifact1_slot = 'novice_guide';

    const schema = character.createFakeCharacterSchema(character.data);

    expect(schema.level).toBe(character.data.level);
    expect(schema.weapon_slot).toBe('iron_sword');
    expect(schema.helmet_slot).toBe('iron_helm');
    expect(schema.artifact1_slot).toBe('novice_guide');
  });

  // The sim API reads an omitted utility quantity as 1, so carrying the potion
  // code across would silently grant the simulated character a free potion.
  it('leaves out the equipped utilities', () => {
    character.data.utility1_slot = 'minor_health_potion';
    character.data.utility1_slot_quantity = 100;
    character.data.utility2_slot = 'small_antidote';
    character.data.utility2_slot_quantity = 100;

    const schema = character.createFakeCharacterSchema(character.data);

    expect(schema).not.toHaveProperty('utility1_slot');
    expect(schema).not.toHaveProperty('utility1_slot_quantity');
    expect(schema).not.toHaveProperty('utility2_slot');
    expect(schema).not.toHaveProperty('utility2_slot_quantity');
  });
});
