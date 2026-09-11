import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  claimWishlistRequest: jest.fn(async () => true),
  deleteWishlistRequestsForJob: jest.fn(async () => 1),
  getWishlistRequestsForJob: jest.fn(async () => []),
  reclaimExecutingWishlistRequests: jest.fn(async () => 0),
}));

import { Character } from '../../src/character/character.js';
import { FulfillWishlistRequestObjective } from '../../src/wishlist/fulfillWishlistRequest.objective.js';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import {
  claimWishlistRequest,
  reclaimExecutingWishlistRequests,
} from '../../src/wishlist/wishlist.utils.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';

const mockedClaim = claimWishlistRequest as jest.MockedFunction<
  typeof claimWishlistRequest
>;
const mockedReclaim = reclaimExecutingWishlistRequests as jest.MockedFunction<
  typeof reclaimExecutingWishlistRequests
>;

const request = (id: number): WishlistRow =>
  ({
    id,
    item_code: 'mithril_bar',
    quantity: 40,
    character: 'LongLegLarry',
    acquisition_method: 'mining',
  }) as WishlistRow;

describe('restoreWishlistClaims', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
    mockedReclaim.mockResolvedValue(0);
    character = new Character({ ...mockCharacterData, name: 'BouncyBella' });
    character.saveJobQueue = jest.fn(async () => {});
  });

  const restoreFulfilJob = (id: number): FulfillWishlistRequestObjective => {
    const job = new FulfillWishlistRequestObjective(character, request(id));
    job.status = 'in_progress';
    character.jobList.push(job);
    return job;
  };

  it('retakes the claim on a request the restored queue is still working on', async () => {
    restoreFulfilJob(4295);

    await character.restoreWishlistClaims();

    expect(mockedClaim).toHaveBeenCalledWith(4295, 'BouncyBella');
  });

  it('keeps the retaken request out of the reclaim sweep', async () => {
    restoreFulfilJob(4295);

    await character.restoreWishlistClaims();

    expect(mockedReclaim).toHaveBeenCalledWith('BouncyBella', [4295]);
  });

  it('still releases the stranded rows nothing in the queue is working on', async () => {
    mockedReclaim.mockResolvedValue(3);

    const released = await character.restoreWishlistClaims();

    expect(released).toBe(3);
    expect(mockedReclaim).toHaveBeenCalledWith('BouncyBella', []);
  });

  it('cancels the restored job when another character now holds the claim', async () => {
    const job = restoreFulfilJob(4295);
    const child = new GatherObjective(
      character,
      { quantity: 40, code: 'mithril_bar' },
      true,
      true,
    );
    child.parentId = job.objectiveId;
    character.jobList.unshift(child);
    mockedClaim.mockResolvedValue(false);

    await character.restoreWishlistClaims();

    expect(job.status).toBe('cancelled');
    expect(child.status).toBe('cancelled');
  });

  it('leaves a lost request out of the exclusion list so the sweep can tidy it', async () => {
    restoreFulfilJob(4295);
    mockedClaim.mockResolvedValue(false);

    await character.restoreWishlistClaims();

    expect(mockedReclaim).toHaveBeenCalledWith('BouncyBella', []);
  });
});
