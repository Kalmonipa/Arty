import { jest } from '@jest/globals';
import { Character } from '../../src/character/characterClass.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { MapSchema, SimpleItemSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionDepositItems: jest.fn(),
  actionMove: jest.fn(),
}));

jest.mock('../../src/api_calls/Maps.js', () => ({
  getMaps: jest.fn(),
  getMapsById: jest.fn(),
}));

jest.mock('../../src/api_calls/Bank.js', () => ({
  actionDepositGold: jest.fn(),
  getBankItems: jest.fn(async () => ({ data: [], total: 0, page: 1, size: 50 })),
}));

import { actionDepositItems } from '../../src/api_calls/Actions.js';

const mockActionDepositItems = actionDepositItems as jest.MockedFunction<
  typeof actionDepositItems
>;

const bankLocation: MapSchema = {
  map_id: 334,
  name: 'City',
  skin: 'forest_bank1',
  x: 4,
  y: 1,
  layer: 'overworld',
  access: { type: 'standard', conditions: [] },
  interactions: {
    content: { type: 'bank', code: 'bank' },
    transition: null,
  },
} as any;

describe('Character.evaluateDepositItemsInBank - itemsToKeep', () => {
  const makeCharacter = (): Character => {
    const char = new Character({
      ...mockCharacterData,
      gold: 0,
      inventory: [
        { slot: 1, code: 'iron_ore', quantity: 50 },
        { slot: 2, code: 'cooked_trout', quantity: 20 },
      ],
    });
    char.move = jest.fn(async (): Promise<boolean> => true) as any;
    char.evaluateClosestMap = jest.fn(() => ({ x: 4, y: 1 })) as any;
    char.getAvailableBanks = jest.fn(
      async (): Promise<MapSchema[]> => [bankLocation],
    );
    return char;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockActionDepositItems.mockImplementation(
      async (data: any) =>
        ({
          data: {
            character: { ...data },
            cooldown: { remaining_seconds: 0, reason: 'deposit' },
          },
        }) as any,
    );
  });

  it('does not deposit an item listed in this.itemsToKeep even when it is not in the passed list', async () => {
    const character = makeCharacter();
    character.itemsToKeep = ['iron_ore'];

    await character.evaluateDepositItemsInBank([], bankLocation, true);

    expect(mockActionDepositItems).toHaveBeenCalled();
    const deposited = mockActionDepositItems.mock.calls[0][1] as SimpleItemSchema[];
    const codes = deposited.map((i) => i.code);
    expect(codes).not.toContain('iron_ore');
    expect(codes).toContain('cooked_trout');
  });
});
