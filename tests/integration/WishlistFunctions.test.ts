import { jest } from '@jest/globals';

jest.mock('../../src/db.js', () => ({ db: { query: jest.fn() } }));
jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

import { db } from '../../src/db.js';
import { getItemInformation } from '../../src/api_calls/Items.js';
import {
  addToWishlist,
  claimWishlistRequest,
  deleteOrphanedWishlistRequests,
  deleteWishlistRequestsForJob,
  findOpenWishlistRequest,
  getOpenWishlistRequests,
  getWishlistRequestsForJob,
  deleteExpiredWishlistRequests,
  markAsFulfilled,
  markAsNotExecuting,
  reclaimExecutingWishlistRequests,
} from '../../src/wishlist/wishlist.utils.js';

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
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 42 }] } as any);

      const id = await addToWishlist({
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining',
      });

      expect(id).toBe(42);
      const insertSql = mockedQuery.mock.calls[0][0] as string;
      expect(insertSql).toMatch(/RETURNING id/i);
    });

    it('inserts a separate row when an identical open request already exists', async () => {
      mockedQuery
        .mockResolvedValueOnce({ rows: [{ id: 7 }] } as any)
        .mockResolvedValueOnce({ rows: [{ id: 8 }] } as any);

      const request = {
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining' as const,
      };
      const first = await addToWishlist(request);
      const second = await addToWishlist(request);

      expect(first).toBe(7);
      expect(second).toBe(8);
      expect(mockedQuery).toHaveBeenCalledTimes(2);
      for (const call of mockedQuery.mock.calls) {
        expect(call[0] as string).toMatch(/INSERT INTO wishlist/i);
      }
    });

    it('records the job the request was raised for', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 51 }] } as any);

      await addToWishlist({
        itemCode: 'steel_bar',
        quantity: 25,
        characterName: 'LongLegLarry',
        jobId: 'train_28_gearcrafting_d194',
      });

      expect(mockedQuery.mock.calls[0][1]).toContain(
        'train_28_gearcrafting_d194',
      );
    });

    it('leaves the job id empty for a request nothing is waiting on', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [{ id: 52 }] } as any);

      await addToWishlist({
        itemCode: 'gold_helm',
        quantity: 1,
        characterName: 'LongLegLarry',
      });

      expect(mockedQuery.mock.calls[0][1]).toContain(null);
    });

    it('returns null when the insert fails', async () => {
      mockedQuery.mockRejectedValueOnce(new Error('db down'));

      const id = await addToWishlist({
        itemCode: 'iron_ore',
        quantity: 10,
        characterName: 'TimidTom',
        acquisitionMethod: 'mining',
      });

      expect(id).toBeNull();
    });
  });

  describe('findOpenWishlistRequest', () => {
    it('returns the open row already raised by the same job for the item', async () => {
      mockedQuery.mockResolvedValue({
        rows: [{ id: 88, item_code: 'steel_bar', quantity: 25 }],
      } as any);

      const found = await findOpenWishlistRequest({
        character: 'LongLegLarry',
        itemCode: 'steel_bar',
        jobId: 'train_28_gearcrafting_d194',
      });

      expect(found).toEqual({
        id: 88,
        item_code: 'steel_bar',
        quantity: 25,
      });
      expect(mockedQuery.mock.calls[0][1]).toEqual([
        'LongLegLarry',
        'steel_bar',
        'train_28_gearcrafting_d194',
      ]);
    });

    it('returns nothing when the job has not asked for the item', async () => {
      mockedQuery.mockResolvedValue({ rows: [] } as any);

      const found = await findOpenWishlistRequest({
        character: 'LongLegLarry',
        itemCode: 'steel_bar',
        jobId: 'train_28_gearcrafting_d194',
      });

      expect(found).toBeUndefined();
    });

    it('matches only unowned rows when no job is given', async () => {
      mockedQuery.mockResolvedValue({ rows: [] } as any);

      await findOpenWishlistRequest({
        character: 'LongLegLarry',
        itemCode: 'gold_helm',
      });

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/job_id IS NULL/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual([
        'LongLegLarry',
        'gold_helm',
      ]);
    });

    it('counts a claimed row as still open so the caller waits instead of asking again', async () => {
      mockedQuery.mockResolvedValue({ rows: [] } as any);

      await findOpenWishlistRequest({
        character: 'LongLegLarry',
        itemCode: 'gold_helm',
      });

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).not.toMatch(/executing = (true|false)/i);
      expect(sql).toMatch(/fulfilled = false/i);
      expect(sql).toMatch(/expiration_date/i);
    });

    it('returns nothing when the lookup fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const found = await findOpenWishlistRequest({
        character: 'LongLegLarry',
        itemCode: 'gold_helm',
      });

      expect(found).toBeUndefined();
    });
  });

  describe('getWishlistRequestsForJob', () => {
    it("returns the job's live rows, fulfilled ones included", async () => {
      mockedQuery.mockResolvedValue({
        rows: [
          { id: 1, fulfilled: true },
          { id: 2, fulfilled: false },
        ],
      } as any);

      const rows = await getWishlistRequestsForJob(
        'LongLegLarry',
        'train_28_gearcrafting_d194',
      );

      expect(rows).toEqual([
        { id: 1, fulfilled: true },
        { id: 2, fulfilled: false },
      ]);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).not.toMatch(/fulfilled = false/i);
      expect(sql).toMatch(/expiration_date/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual([
        'LongLegLarry',
        'train_28_gearcrafting_d194',
      ]);
    });

    it('returns an empty array when the lookup fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const rows = await getWishlistRequestsForJob('LongLegLarry', 'job_1');

      expect(rows).toEqual([]);
    });
  });

  describe('deleteWishlistRequestsForJob', () => {
    it("deletes the job's rows and returns the count", async () => {
      mockedQuery.mockResolvedValue({ rowCount: 20 } as any);

      const deleted = await deleteWishlistRequestsForJob(
        'LongLegLarry',
        'train_28_gearcrafting_d194',
      );

      expect(deleted).toBe(20);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/DELETE FROM wishlist/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual([
        'LongLegLarry',
        'train_28_gearcrafting_d194',
      ]);
    });

    it('returns 0 when the delete fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const deleted = await deleteWishlistRequestsForJob('LongLegLarry', 'j');

      expect(deleted).toBe(0);
    });
  });

  describe('deleteOrphanedWishlistRequests', () => {
    it('deletes owned rows whose job is no longer around', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 4 } as any);

      const deleted = await deleteOrphanedWishlistRequests('LongLegLarry', [
        'train_28_gearcrafting_d194',
      ]);

      expect(deleted).toBe(4);
      expect(mockedQuery.mock.calls[0][1]).toEqual([
        'LongLegLarry',
        ['train_28_gearcrafting_d194'],
      ]);
    });

    it('leaves the aspirational rows nothing is waiting on alone', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 0 } as any);

      await deleteOrphanedWishlistRequests('LongLegLarry', []);

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/job_id IS NOT NULL/i);
      expect(sql).toMatch(/fulfilled = false/i);
    });

    it('returns 0 when the delete fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const deleted = await deleteOrphanedWishlistRequests('LongLegLarry', []);

      expect(deleted).toBe(0);
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

  describe('claimWishlistRequest', () => {
    it('claims an open request for the character', async () => {
      mockedQuery.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 340 }],
      } as any);

      const claimed = await claimWishlistRequest(340, 'JumpyJimmy');

      expect(claimed).toBe(true);
      expect(mockedQuery.mock.calls[0][1]).toEqual([340, 'JumpyJimmy']);
    });

    it('only claims a request that nobody else is executing', async () => {
      mockedQuery.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 340 }],
      } as any);

      await claimWishlistRequest(340, 'JumpyJimmy');

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/executing = false/i);
      expect(sql).toMatch(/fulfilled = false/i);
      expect(sql).toMatch(/executing_by = \$2/i);
    });

    it('returns false when another character already holds the request', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 0, rows: [] } as any);

      const claimed = await claimWishlistRequest(340, 'BouncyBella');

      expect(claimed).toBe(false);
    });

    // A fulfil job re-enters this after a child gather job finishes, so it has to
    // be able to re-claim the row it already holds. Requiring executing = false
    // made it lose the race to itself and fail, stranding the row as
    // executing = true forever so nobody could ever pick it up.
    it('lets the holder re-claim a request it already holds', async () => {
      mockedQuery.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 340 }],
      } as any);

      await claimWishlistRequest(340, 'BouncyBella');

      const sql = (mockedQuery.mock.calls[0][0] as string).replace(/\s+/g, ' ');
      expect(sql).toMatch(/executing = false OR executing_by = \$2/i);
    });

    it('returns false when the update fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const claimed = await claimWishlistRequest(340, 'BouncyBella');

      expect(claimed).toBe(false);
    });
  });

  describe('markAsNotExecuting', () => {
    it('releases the claim the character holds', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 1 } as any);

      const ok = await markAsNotExecuting(340, 'JumpyJimmy');

      expect(ok).toBe(true);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/SET executing = false/i);
      expect(sql).toMatch(/executing_by = NULL/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual([340, 'JumpyJimmy']);
    });

    it('does not release a claim held by another character', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 1 } as any);

      await markAsNotExecuting(340, 'JumpyJimmy');

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/WHERE id = \$1 AND executing_by = \$2/i);
    });
  });

  describe('markAsFulfilled', () => {
    it('only marks the request the character holds as fulfilled', async () => {
      mockedQuery.mockResolvedValue({ rowCount: 1 } as any);

      const ok = await markAsFulfilled(340, 'JumpyJimmy');

      expect(ok).toBe(true);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/SET fulfilled = true/i);
      expect(sql).toMatch(/WHERE id = \$1 AND executing_by = \$2/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual([340, 'JumpyJimmy']);
    });
  });

  describe('reclaimExecutingWishlistRequests', () => {
    it("resets the character's own stranded rows and returns the count", async () => {
      mockedQuery.mockResolvedValue({ rowCount: 26 } as any);

      const reclaimed = await reclaimExecutingWishlistRequests('JumpyJimmy');

      expect(reclaimed).toBe(26);
      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/SET\s+executing = false/i);
      expect(sql).toMatch(/executing = true AND fulfilled = false/i);
      expect(mockedQuery.mock.calls[0][1]).toEqual(['JumpyJimmy']);
    });

    it("leaves other characters' in-flight claims alone", async () => {
      mockedQuery.mockResolvedValue({ rowCount: 0 } as any);

      await reclaimExecutingWishlistRequests('JumpyJimmy');

      const sql = mockedQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/executing_by = \$1/i);
    });

    it('returns 0 when the update fails', async () => {
      mockedQuery.mockRejectedValue(new Error('db down'));

      const reclaimed = await reclaimExecutingWishlistRequests('JumpyJimmy');

      expect(reclaimed).toBe(0);
    });
  });
});
