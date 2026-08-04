import { jest } from '@jest/globals';
import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveFailed,
  ObjectiveOnHold,
  ObjectiveResult,
  ObjectiveCompleted,
} from '../../src/types/ObjectiveData.js';

class TestObjective extends Objective {
  private result: ObjectiveResult;
  /** Simulates the job wishlisting something it can't obtain while running */
  raisesRequestWhileRunning = false;

  constructor(character: any, id: string, result: ObjectiveResult) {
    super(character, id, 'not_started');
    this.jobFlavour = 'TestJob';
    this.result = result;
  }

  async run(): Promise<ObjectiveResult> {
    if (this.raisesRequestWhileRunning) {
      this.character.pendingWishlistRequests.push({
        requestId: 664,
        itemCode: 'hardwood_plank',
        quantity: 25,
      });
      this.raisedBlockingRequest = true;
    }
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
    pendingWishlistRequests: [
      { requestId: 664, itemCode: 'hardwood_plank', quantity: 25 },
    ],
    cooldownStatus: jest.fn(async () => undefined),
    parkJob: jest.fn(async () => true),
  }) as any;

describe('Objective.execute parking', () => {
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

  it('leaves the pending requests for the owning job to park on', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'craft_5_skull_staff',
      ObjectiveOnHold,
    );

    await job.execute();

    expect(character.pendingWishlistRequests).toHaveLength(1);
  });

  it('parks a job that opts in when it raised blocking requests', async () => {
    const character = makeCharacter();
    const job = new TestObjective(
      character,
      'train_29_weaponcrafting',
      ObjectiveFailed,
    );
    job.parkOnWishlistRequest = true;
    job.raisesRequestWhileRunning = true;

    const result = await job.execute();

    expect(character.parkJob).toHaveBeenCalledWith(job);
    expect(result.reason).toBe('on_hold');
    expect(character.pendingWishlistRequests).toEqual([]);
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
});
