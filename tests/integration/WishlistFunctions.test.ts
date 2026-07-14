import { jest } from '@jest/globals';

jest.mock('../../src/db.js', () => ({ db: { query: jest.fn() } }));
jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

import { db } from '../../src/db.js';
import { getItemInformation } from '../../src/api_calls/Items.js';
import {
  addToWishlist,
  getOpenWishlistRequests,
  getWishlistRequestsByIds,
  deleteExpiredWishlistRequests,
} from '../../src/wishlist/functions.js';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockedGetItem = getItemInformation as jest.MockedFunction<
  typeof getItemInformation
>;

describe('wishlist functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockResolvedValue({
      code: 'iron_ore',
      level: 5,
      subtype: '',
      craft: { skill: 'mining', level: 5, items: [], quantity: 1 },
    } as any);
  });

  describe('addToWishlist', () => {
    it('returns the id of the newly inserted request', async () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [] } as any) // no duplicate
        .mockResolvedValueOnce({ rows: [{ id: 42 }] } as any); // insert

      const id = await addToWishlist({
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining',
      });

      expect(id).toBe(42);
      const insertSql = mockedQuery.mock.calls[1][0] as string;
      expect(insertSql).toMatch(/RETURNING id/i);
    });

    it('reuses an existing open request instead of inserting a duplicate', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] } as any); // duplicate found

      const id = await addToWishlist({
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining',
      });

      expect(id).toBe(7);
      expect(mockedQuery).toHaveBeenCalledTimes(1); // no insert
    });

    it('returns null when the insert fails', async () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockRejectedValueOnce(new Error('db down'));

      const id = await addToWishlist({
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining',
      });

      expect(id).toBeNull();
    });
  });

  describe('getOpenWishlistRequests', () => {
    it('excludes expired requests', async () => {
      mockedQuery.mockResolvedValue({ rows: [] } as any);

      await getOpenWishlistRequests('mining');

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/expiration_date/i);
    });
  });

  describe('getWishlistRequestsByIds', () => {
    it('returns an empty array without querying when given no ids', async () => {
      const rows = await getWishlistRequestsByIds([]);

      expect(rows).toEqual([]);
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('fetches the rows for the given ids', async () => {
      mockedQuery.mockResolvedValue({
        rows: [{ id: 1, fulfilled: true }],
      } as any);

      const rows = await getWishlistRequestsByIds([1, 2]);

      expect(rows).toEqual([{ id: 1, fulfilled: true }]);
      expect(mockedQuery.mock.calls[0][1]).toEqual([[1, 2]]);
    });
  });

  describe('deleteExpiredWishlistRequests', () => {
    it('deletes expired rows and returns the count', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 3 } as any);

      const deleted = await deleteExpiredWishlistRequests();

      expect(deleted).toBe(3);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/DELETE FROM wishlist/i);
      expect(sql).toMatch(/expiration_date < NOW\(\)/i);
    });
  });
});
