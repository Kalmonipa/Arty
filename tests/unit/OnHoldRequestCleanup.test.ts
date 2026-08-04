import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteWishlistRequestsForJob: jest.fn(async () => 1),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Character } from '../../src/character/CharacterClass.js';
import { deleteWishlistRequestsForJob } from '../../src/wishlist/functions.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { OnHoldJob } from '../../src/types/ObjectiveData.js';

const mockedDeleteForJob = deleteWishlistRequestsForJob as jest.MockedFunction<
  typeof deleteWishlistRequestsForJob
>;

const onHoldEntry = (objectiveId: string): OnHoldJob =>
  ({
    job: { objectiveId },
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
      const entry = onHoldEntry('train_23_weaponcrafting_4834');
      character.onHold = [entry];

      await character.dropOnHoldJob(entry);

      expect(mockedDeleteForJob).toHaveBeenCalledWith(
        'TestCharacter',
        'train_23_weaponcrafting_4834',
      );
      expect(character.onHold).toEqual([]);
    });

    it("leaves another parked job's requests alone", async () => {
      const dropped = onHoldEntry('train_23_weaponcrafting_4834');
      const other = onHoldEntry('train_24_weaponcrafting_aaaa');
      character.onHold = [dropped, other];

      await character.dropOnHoldJob(dropped);

      expect(mockedDeleteForJob).not.toHaveBeenCalledWith(
        'TestCharacter',
        'train_24_weaponcrafting_aaaa',
      );
      expect(character.onHold).toEqual([other]);
    });
  });

  describe('parkJob when the queue is full', () => {
    it('rolls back the requests the job raised instead of leaking them', async () => {
      character.maxOnHoldJobs = 1;
      character.onHold = [onHoldEntry('existing_job')];

      const parked = await character.parkJob({
        objectiveId: 'train_18_jewelrycrafting_8546',
      } as any);

      expect(parked).toBe(false);
      expect(mockedDeleteForJob).toHaveBeenCalledWith(
        'TestCharacter',
        'train_18_jewelrycrafting_8546',
      );
    });
  });
});
