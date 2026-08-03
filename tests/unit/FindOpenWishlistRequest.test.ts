import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  getWishlistRequestsByIds: jest.fn(async () => []),
  deleteWishlistRequest: jest.fn(async () => true),
  addToWishlist: jest.fn(async () => null),
}));

import { Character } from '../../src/character/CharacterClass.js';
import { getWishlistRequestsByIds } from '../../src/wishlist/functions.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { WishlistRow } from '../../src/wishlist/types.js';

const mockedGetByIds = getWishlistRequestsByIds as jest.MockedFunction<
  typeof getWishlistRequestsByIds
>;

const row = (id: number, fulfilled = false): WishlistRow =>
  ({
    id,
    item_code: 'steel_bar',
    quantity: 10,
    character: 'TestCharacter',
    fulfilled,
  }) as unknown as WishlistRow;

describe('Character.findOpenWishlistRequest', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
  });

  it('returns nothing and skips the lookup when no request was raised for the item', async () => {
    character.pendingWishlistRequests = [
      { requestId: 1, itemCode: 'iron_ore', quantity: 5 },
    ];

    const found = await character.findOpenWishlistRequest('steel_bar');

    expect(found).toBeUndefined();
    expect(mockedGetByIds).not.toHaveBeenCalled();
  });

  it('returns the request when its row is still open', async () => {
    character.pendingWishlistRequests = [
      { requestId: 7, itemCode: 'steel_bar', quantity: 10 },
    ];
    mockedGetByIds.mockResolvedValue([row(7)]);

    const found = await character.findOpenWishlistRequest('steel_bar');

    expect(found).toEqual({
      requestId: 7,
      itemCode: 'steel_bar',
      quantity: 10,
    });
    expect(mockedGetByIds).toHaveBeenCalledWith([7]);
  });

  it('prunes and returns nothing when the row has been fulfilled', async () => {
    character.pendingWishlistRequests = [
      { requestId: 7, itemCode: 'steel_bar', quantity: 10 },
    ];
    mockedGetByIds.mockResolvedValue([row(7, true)]);

    const found = await character.findOpenWishlistRequest('steel_bar');

    expect(found).toBeUndefined();
    expect(character.pendingWishlistRequests).toEqual([]);
  });

  it('prunes and returns nothing when the row has been deleted', async () => {
    character.pendingWishlistRequests = [
      { requestId: 7, itemCode: 'steel_bar', quantity: 10 },
    ];
    mockedGetByIds.mockResolvedValue([]);

    const found = await character.findOpenWishlistRequest('steel_bar');

    expect(found).toBeUndefined();
    expect(character.pendingWishlistRequests).toEqual([]);
  });

  it('leaves requests for other items alone when pruning', async () => {
    character.pendingWishlistRequests = [
      { requestId: 1, itemCode: 'iron_ore', quantity: 5 },
      { requestId: 7, itemCode: 'steel_bar', quantity: 10 },
    ];
    mockedGetByIds.mockResolvedValue([]);

    await character.findOpenWishlistRequest('steel_bar');

    expect(character.pendingWishlistRequests).toEqual([
      { requestId: 1, itemCode: 'iron_ore', quantity: 5 },
    ]);
  });
});
