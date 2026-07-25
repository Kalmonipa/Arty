import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  deleteWishlistRequest: jest.fn(async () => true),
  addToWishlist: jest.fn(async () => null),
}));

import { Character } from '../../src/character/characterClass.js';
import { deleteWishlistRequest } from '../../src/wishlist/functions.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import {
  OnHoldJob,
  WishlistRequestRef,
} from '../../src/types/ObjectiveData.js';

const mockedDelete = deleteWishlistRequest as jest.MockedFunction<
  typeof deleteWishlistRequest
>;

const ref = (
  requestId: number,
  itemCode = 'iron_bar',
  quantity = 6,
): WishlistRequestRef => ({ requestId, itemCode, quantity });

const onHoldEntry = (
  objectiveId: string,
  waitingOn: WishlistRequestRef[] = [],
): OnHoldJob =>
  ({
    job: { objectiveId },
    waitingOn,
    parkedAt: '2026-07-20T00:00:00.000Z',
    retried: false,
  }) as unknown as OnHoldJob;

describe('on-hold wishlist request cleanup', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
  });

  describe('dropOnHoldJob', () => {
    it('deletes the wishlist requests the dropped job was waiting on', async () => {
      const entry = onHoldEntry('train_23_weaponcrafting_4834', [
        ref(340, 'steel_bar', 10),
      ]);
      character.onHold = [entry];

      await character.dropOnHoldJob(entry);

      expect(mockedDelete).toHaveBeenCalledWith(340);
      expect(character.onHold).toEqual([]);
    });

    it('keeps a request still referenced by another on-hold job', async () => {
      const dropped = onHoldEntry('train_23_weaponcrafting_4834', [
        ref(340, 'steel_bar', 10),
      ]);
      const other = onHoldEntry('train_24_weaponcrafting_aaaa', [
        ref(340, 'steel_bar', 10),
      ]);
      character.onHold = [dropped, other];

      await character.dropOnHoldJob(dropped);

      expect(mockedDelete).not.toHaveBeenCalled();
      expect(character.onHold).toEqual([other]);
    });
  });

  describe('parkJob when the queue is full', () => {
    it('rolls back the requests the job raised instead of leaking them', async () => {
      character.maxOnHoldJobs = 1;
      character.onHold = [onHoldEntry('existing_job')];
      character.pendingWishlistRequests = [ref(357, 'iron_bar', 30)];

      const parked = await character.parkJob({
        objectiveId: 'train_18_jewelrycrafting_8546',
      } as any);

      expect(parked).toBe(false);
      expect(mockedDelete).toHaveBeenCalledWith(357);
    });

    it('does not delete a pending request already referenced by an on-hold job', async () => {
      character.maxOnHoldJobs = 1;
      character.onHold = [
        onHoldEntry('existing_job', [ref(357, 'iron_bar', 30)]),
      ];
      character.pendingWishlistRequests = [ref(357, 'iron_bar', 30)];

      const parked = await character.parkJob({
        objectiveId: 'train_18_jewelrycrafting_8546',
      } as any);

      expect(parked).toBe(false);
      expect(mockedDelete).not.toHaveBeenCalled();
    });
  });
});
