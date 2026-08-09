import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/functions.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveFailed,
  ObjectiveOnHold,
  ObjectiveResult,
  ObjectiveCompleted,
} from '../../src/types/ObjectiveData.js';
import { getWishlistRequestsForJob } from '../../src/wishlist/functions.js';
import { WishlistRow } from '../../src/wishlist/types.js';

const mockedRequestsForJob = getWishlistRequestsForJob as jest.MockedFunction<
  typeof getWishlistRequestsForJob
>;

const row = (fulfilled: boolean): WishlistRow =>
  ({ id: 664, item_code: 'hardwood_plank', quantity: 25, fulfilled }) as any;

class TestObjective extends Objective {
  private result: ObjectiveResult;
  /** Records the owning job a nested request would have been stamped with */
  ownerSeenWhileRunning?: string;

  constructor(character: any, id: string, result: ObjectiveResult) {
    super(character, id, 'not_started');
    this.jobFlavour = 'TestJob';
    this.result = result;
  }

  async run(): Promise<ObjectiveResult> {
    this.ownerSeenWhileRunning = this.character.wishlistRequestOwnerId;
    return this.result;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}

const makeCharacter = () =>
  ({
    data: { name: 'TestChar' },
    jobList: [],
    itemsToKeep: [],
    enableEvents: false,
    cooldownStatus: jest.fn(async () => undefined),
    checkForBossFightParticipation: jest.fn(async () => undefined),
    parkJob: jest.fn(async () => true),
  }) as any;

describe('Objective.execute parking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequestsForJob.mockResolvedValue([]);
  });

  it('does not park a nested job that reports on_hold', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'craft_25_hardwood_plank',
      ObjectiveOnHold,
    );

    const result = await job.execute();

    expect(character.parkJob).not.toHaveBeenCalled();
    expect(result.reason).toBe('on_hold');
  });

  it('parks a job that opts in when it is still waiting on a request it raised', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveFailed,
    );
    job.parkOnWishlistRequest = true;
    mockedRequestsForJob.mockResolvedValue([row(false)]);

    const result = await job.execute();

    expect(mockedRequestsForJob).toHaveBeenCalledWith(
      'TestChar',
      job.objectiveId,
    );
    expect(character.parkJob).toHaveBeenCalledWith(job);
    expect(result.reason).toBe('on_hold');
  });

  it('does not park an opted-in job that raised no requests', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveCompleted,
    );
    job.parkOnWishlistRequest = true;

    const result = await job.execute();

    expect(character.parkJob).not.toHaveBeenCalled();
    expect(result.reason).toBe('complete');
  });

  it('does not park an opted-in job whose requests have all been delivered', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveCompleted,
    );
    job.parkOnWishlistRequest = true;
    mockedRequestsForJob.mockResolvedValue([row(true)]);

    await job.execute();

    expect(character.parkJob).not.toHaveBeenCalled();
  });

  it('owns the requests raised while an opted-in job runs', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveCompleted,
    );
    job.parkOnWishlistRequest = true;

    await job.execute();

    expect(job.ownerSeenWhileRunning).toBe(job.objectiveId);
  });

  it('leaves ownership with the parking ancestor while a nested job runs', async () => {
    const character = makeCharacter();
    character.wishlistRequestOwnerId = 'train_29_weaponcrafting_26dd';
    const job = new TestObjective(
      character,
      'craft_25_hardwood_plank',
      ObjectiveCompleted,
    );

    await job.execute();

    expect(job.ownerSeenWhileRunning).toBe('train_29_weaponcrafting_26dd');
  });

  it('hands ownership back to the outer job once an opted-in job finishes', async () => {
    const character = makeCharacter();
    character.wishlistRequestOwnerId = 'item_task_objective_1111';
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveCompleted,
    );
    job.parkOnWishlistRequest = true;

    await job.execute();

    expect(character.wishlistRequestOwnerId).toBe('item_task_objective_1111');
  });
});
