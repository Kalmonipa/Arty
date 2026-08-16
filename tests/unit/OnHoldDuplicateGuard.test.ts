import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { Gearcrafting, Weaponcrafting } from '../../src/names.js';

class TestObjective extends Objective {
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}

const parked = (objectiveId: string) => ({ job: { objectiveId } }) as any;

const makeObjective = (onHold: any[]) => {
  const character = { data: { name: 'LongLegLarry' }, onHold } as any;
  return new TestObjective(character, 'idle_crafter_objective', 'not_started');
};

describe('checkForJobInOnHoldQueue', () => {
  it('allows training a skill with nothing parked for it', () => {
    const objective = makeObjective([]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(false);
  });

  // Duplicates each raise their own wishlist request for the same materials, so
  // three parked copies asked for three times what was actually needed and
  // crowded the other skills out of the fixed-size onHold queue.
  it('blocks a second job once one is already parked for that skill', () => {
    const objective = makeObjective([parked('train_30_gearcrafting_bd73')]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(true);
  });

  it('does not let one skill block a different one', () => {
    const objective = makeObjective([parked('train_33_weaponcrafting_d6bb')]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(false);
    expect(objective.checkForJobInOnHoldQueue(Weaponcrafting)).toBe(true);
  });
});
