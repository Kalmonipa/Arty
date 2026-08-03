import { jest } from '@jest/globals';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';

jest.mock('../../src/wishlist/functions.js', () => ({
  getOpenWishlistRequests: jest.fn(),
  claimWishlistRequest: jest.fn(async () => true),
  markAsFulfilled: jest.fn(async () => true),
  markAsNotExecuting: jest.fn(async () => true),
}));
jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
}));

import { Character } from '../../src/character/CharacterClass.js';
import {
  claimWishlistRequest,
  getOpenWishlistRequests,
  markAsFulfilled,
  markAsNotExecuting,
} from '../../src/wishlist/functions.js';
import { getItemInformation } from '../../src/api_calls/Items.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { IdentifyValidWishlistRequestsObjective } from '../../src/wishlist/identifyValidWishlistRequests.js';

const mockedOpen = getOpenWishlistRequests as jest.MockedFunction<
  typeof getOpenWishlistRequests
>;
const mockedFulfilled = markAsFulfilled as jest.MockedFunction<
  typeof markAsFulfilled
>;
const mockedNotExecuting = markAsNotExecuting as jest.MockedFunction<
  typeof markAsNotExecuting
>;
const mockedGetItem = getItemInformation as jest.MockedFunction<
  typeof getItemInformation
>;
const mockedClaim = claimWishlistRequest as jest.MockedFunction<
  typeof claimWishlistRequest
>;

describe('IdentifyValidWishlistRequestsObjective request release', () => {
  let character: Character;
  let job: IdentifyValidWishlistRequestsObjective;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedClaim.mockResolvedValue(true);
    character = new Character({ ...mockCharacterData });
    jest.spyOn(character, 'getCharacterLevel').mockReturnValue(40);
    character.gatherNow = jest.fn(async () => ObjectiveCompleted) as any;

    mockedGetItem.mockResolvedValue({ code: 'steel_bar', level: 20 } as any);
    mockedOpen.mockResolvedValue([
      { id: 340, item_code: 'steel_bar', quantity: 5 } as any,
    ]);

    job = new IdentifyValidWishlistRequestsObjective(character, 'mining');
  });

  it('marks the request fulfilled when the deposit succeeds', async () => {
    character.depositNow = jest.fn(async () => ObjectiveCompleted) as any;

    await job.run();

    expect(mockedFulfilled).toHaveBeenCalledWith(340, character.data.name);
    expect(mockedNotExecuting).not.toHaveBeenCalled();
  });

  it('clears the executing flag when the deposit fails', async () => {
    character.depositNow = jest.fn(async () => ObjectiveFailed) as any;

    await job.run();

    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).toHaveBeenCalledWith(340, character.data.name);
  });

  it('clears the executing flag when gathering throws mid-attempt', async () => {
    character.gatherNow = jest.fn(async () => {
      throw new Error('character died');
    }) as any;
    character.depositNow = jest.fn(async () => ObjectiveCompleted) as any;

    await expect(job.run()).rejects.toThrow('character died');

    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).toHaveBeenCalledWith(340, character.data.name);
  });

  it('claims the request for this character before working on it', async () => {
    character.depositNow = jest.fn(async () => ObjectiveCompleted) as any;

    await job.run();

    expect(mockedClaim).toHaveBeenCalledWith(340, character.data.name);
  });

  it('does no work when another character already holds the request', async () => {
    mockedClaim.mockResolvedValue(false);
    character.depositNow = jest.fn(async () => ObjectiveCompleted) as any;

    await job.run();

    expect(character.gatherNow).not.toHaveBeenCalled();
    expect(character.depositNow).not.toHaveBeenCalled();
    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).not.toHaveBeenCalled();
  });
});
