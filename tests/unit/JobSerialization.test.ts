import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  deleteWishlistRequest: jest.fn(async () => true),
  addToWishlist: jest.fn(async () => null),
}));

import { Character } from '../../src/character/CharacterClass.js';
import { CraftObjective } from '../../src/core/CraftObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

describe('job serialization round trip', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
  });

  it('keeps a resumed job pointing at the root of the tree it came from', async () => {
    const root = new CraftObjective(character, {
      code: 'steel_ring',
      quantity: 5,
    });
    const child = new CraftObjective(character, {
      code: 'iron_bar',
      quantity: 10,
    });
    character.jobList = [root, child];
    child.parentId = root.objectiveId;
    child.updateRootId();

    await character.parkJob(child);
    // The rest of the tree is gone by the time a parked job is resumed
    character.jobList = [];
    await character.resumeOnHoldJob(character.onHold[0]);

    expect(character.jobList[0].rootId).toBe(root.objectiveId);
  });
});
