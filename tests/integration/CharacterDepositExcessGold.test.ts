import { jest } from '@jest/globals';
import { Character } from '../../src/core/Character.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

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
import { getMaps } from '../../src/api_calls/Maps.js';
import { actionDepositGold } from '../../src/api_calls/Bank.js';

const mockActionDepositItems = actionDepositItems as jest.MockedFunction<typeof actionDepositItems>;
const mockGetMaps = getMaps as jest.MockedFunction<typeof getMaps>;
const mockActionDepositGold = actionDepositGold as jest.MockedFunction<typeof actionDepositGold>;

describe('Character.evaluateDepositItemsInBank - excess gold', () => {
  let character: Character;

  // level 25 -> carry cap = 75000
  const makeCharacter = (level: number, gold: number) => {
    const char = new Character({ ...mockCharacterData, level, gold });
    // Keep the test focused on the deposit logic, not pathfinding.
    char.move = jest.fn(async (): Promise<boolean> => true) as any;
    char.evaluateClosestMap = jest.fn(() => ({ x: 0, y: 0 })) as any;
    return char;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetMaps.mockResolvedValue({
      data: [{ x: 0, y: 0, map_id: 1, skin: '', layer: 'overworld', interactions: { content: null } }],
      total: 1,
      page: 1,
      size: 50,
    } as any);

    // Item deposit succeeds and returns the character with gold untouched.
    mockActionDepositItems.mockImplementation(async (data: any) => ({
      data: { character: { ...data }, cooldown: { remaining_seconds: 0, reason: 'deposit' } },
    }) as any);

    // Gold deposit succeeds and returns the character with gold reduced.
    mockActionDepositGold.mockImplementation(async (data: any, quantity: number) => ({
      data: {
        character: { ...data, gold: data.gold - quantity },
        bank: { quantity: quantity },
        cooldown: { remaining_seconds: 0, reason: 'deposit_gold' },
      },
    }) as any);
  });

  it('deposits gold above the carry cap after depositing items', async () => {
    character = makeCharacter(25, 134000); // cap 75000 -> excess 59000

    await character.evaluateDepositItemsInBank([], undefined, true);

    expect(mockActionDepositItems).toHaveBeenCalled();
    expect(mockActionDepositGold).toHaveBeenCalledWith(expect.anything(), 59000);
  });

  it('does not deposit gold when holding at or below the carry cap', async () => {
    character = makeCharacter(25, 50000); // below cap 75000

    await character.evaluateDepositItemsInBank([], undefined, true);

    expect(mockActionDepositItems).toHaveBeenCalled();
    expect(mockActionDepositGold).not.toHaveBeenCalled();
  });

  it('does not deposit gold when the inventory is not full enough to visit the bank', async () => {
    character = makeCharacter(25, 134000);

    // No force flag and inventory well below the 90% threshold -> no bank trip.
    const result = await character.evaluateDepositItemsInBank();

    expect(result).toBe(false);
    expect(mockActionDepositItems).not.toHaveBeenCalled();
    expect(mockActionDepositGold).not.toHaveBeenCalled();
  });
});
