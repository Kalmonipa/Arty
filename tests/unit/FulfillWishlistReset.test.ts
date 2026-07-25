import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  getOpenWishlistRequests: jest.fn(),
  markAsExecuting: jest.fn(async () => true),
  markAsFulfilled: jest.fn(async () => true),
  markAsNotExecuting: jest.fn(async () => true),
}));
jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
}));

import { Character } from '../../src/character/characterClass.js';
import { FulfillWishlistRequestObjective } from '../../src/wishlist/fulfillWishlistRequest.js';
import {
  getOpenWishlistRequests,
  markAsFulfilled,
  markAsNotExecuting,
} from '../../src/wishlist/functions.js';
import { getItemInformation } from '../../src/api_calls/Items.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

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

describe('FulfillWishlistRequestObjective request release', () => {
  let character: Character;
  let job: FulfillWishlistRequestObjective;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    jest.spyOn(character, 'getCharacterLevel').mockReturnValue(40);
    character.gatherNow = jest.fn(async () => true) as any;

    mockedGetItem.mockResolvedValue({ code: 'steel_bar', level: 20 } as any);
    mockedOpen.mockResolvedValue([
      { id: 340, item_code: 'steel_bar', quantity: 5 } as any,
    ]);

    job = new FulfillWishlistRequestObjective(character, 'mining');
  });

  it('marks the request fulfilled when the deposit succeeds', async () => {
    character.depositNow = jest.fn(async () => true) as any;

    await job.run();

    expect(mockedFulfilled).toHaveBeenCalledWith(340);
    expect(mockedNotExecuting).not.toHaveBeenCalled();
  });

  it('clears the executing flag when the deposit fails', async () => {
    character.depositNow = jest.fn(async () => false) as any;

    await job.run();

    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).toHaveBeenCalledWith(340);
  });

  it('clears the executing flag when gathering throws mid-attempt', async () => {
    character.gatherNow = jest.fn(async () => {
      throw new Error('character died');
    }) as any;
    character.depositNow = jest.fn(async () => true) as any;

    await expect(job.run()).rejects.toThrow('character died');

    expect(mockedFulfilled).not.toHaveBeenCalled();
    expect(mockedNotExecuting).toHaveBeenCalledWith(340);
  });
});
