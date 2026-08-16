import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteExpiredWishlistRequests: jest.fn(async () => 0),
  deleteOrphanedWishlistRequests: jest.fn(async () => 0),
  deleteWishlistRequest: jest.fn(async () => true),
  deleteWishlistRequestsForJob: jest.fn(async () => 1),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Character } from '../../src/character/character.js';
import { checkOnHoldQueue } from '../../src/idleObjectives/idle.utils.js';
import { getWishlistRequestsForJob } from '../../src/wishlist/wishlist.utils.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { OnHoldJob } from '../../src/types/ObjectiveData.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';

const mockedRequestsForJob = getWishlistRequestsForJob as jest.MockedFunction<
  typeof getWishlistRequestsForJob
>;

const onHoldEntry = (objectiveId: string): OnHoldJob =>
  ({
    job: { objectiveId },
    parkedAt: '2026-08-11T06:41:53.000Z',
    retried: false,
  }) as unknown as OnHoldJob;

const row = (fulfilled: boolean): WishlistRow =>
  ({ id: 2714, item_code: 'hardwood_plank', quantity: 14, fulfilled }) as any;

describe('checkOnHoldQueue', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
    character.resumeOnHoldJob = jest.fn(async (entry) => {
      character.onHold = character.onHold.filter((e) => e !== entry);
    });
  });

  it('reports how many parked jobs it resumed', async () => {
    character.data.gearcrafting_level = 29;
    character.onHold = [onHoldEntry('train_30_gearcrafting_bd73')];
    mockedRequestsForJob.mockResolvedValue([row(true)]);

    const resumed = await checkOnHoldQueue(character);

    expect(resumed).toBe(1);
    expect(character.resumeOnHoldJob).toHaveBeenCalledTimes(1);
  });

  it('reports nothing resumed while a request is still outstanding', async () => {
    character.data.gearcrafting_level = 29;
    character.onHold = [onHoldEntry('train_30_gearcrafting_bd73')];
    mockedRequestsForJob.mockResolvedValue([row(false)]);

    const resumed = await checkOnHoldQueue(character);

    expect(resumed).toBe(0);
    expect(character.resumeOnHoldJob).not.toHaveBeenCalled();
  });

  // Parked copies targeting a level already reached squatted in the fixed-size
  // onHold queue, which then refused to park anything else
  it('drops a parked train job whose target level has been reached', async () => {
    character.data.gearcrafting_level = 29;
    character.onHold = [onHoldEntry('train_29_gearcrafting_3e13')];

    const resumed = await checkOnHoldQueue(character);

    expect(resumed).toBe(0);
    expect(character.onHold).toEqual([]);
    expect(mockedRequestsForJob).not.toHaveBeenCalled();
  });

  it('keeps a parked train job that is still aiming above the current level', async () => {
    character.data.gearcrafting_level = 29;
    character.onHold = [onHoldEntry('train_30_gearcrafting_bd73')];
    mockedRequestsForJob.mockResolvedValue([row(false)]);

    await checkOnHoldQueue(character);

    expect(character.onHold).toHaveLength(1);
  });
});
