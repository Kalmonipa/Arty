import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 907),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import {
  addToWishlist,
  findOpenWishlistRequest,
} from '../../src/wishlist/wishlist.utils.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';

const mockedAdd = addToWishlist as jest.MockedFunction<typeof addToWishlist>;
const mockedFind = findOpenWishlistRequest as jest.MockedFunction<
  typeof findOpenWishlistRequest
>;

class TestObjective extends Objective {
  constructor(character: any, id: string) {
    super(character, id, 'not_started');
    this.jobFlavour = 'TestJob';
  }

  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}

/** Stands in for EvaluateGearObjective, which wishes rather than blocks */
class UnownedRequestObjective extends TestObjective {
  protected wishlistRequestOwner(): undefined {
    return undefined;
  }
}

const makeCharacter = (wishlistRequestOwnerId?: string) =>
  ({
    data: { name: 'LongLegLarry' },
    jobList: [],
    wishlistRequestOwnerId,
  }) as any;

describe('Objective.requestIngredientFromWishlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFind.mockResolvedValue(undefined);
  });

  it('records the request against the job that cannot continue without it', async () => {
    const character = makeCharacter('train_28_gearcrafting_d194');
    const job = new TestObjective(character, 'craft_25_steel_bar');

    await job.requestIngredientFromWishlist({
      code: 'steel_bar',
      quantity: 25,
    });

    expect(mockedAdd).toHaveBeenCalledWith({
      itemCode: 'steel_bar',
      quantity: 25,
      characterName: 'LongLegLarry',
      jobId: 'train_28_gearcrafting_d194',
    });
    expect(job.raisedBlockingRequest).toBe(true);
  });

  it('passes the caller overrides through to the request', async () => {
    const character = makeCharacter('train_28_gearcrafting_d194');
    const job = new TestObjective(character, 'gather_10_hard_leather');

    await job.requestIngredientFromWishlist(
      { code: 'hard_leather', quantity: 10 },
      { acquisitionMethod: 'mining', minLevel: 20 },
    );

    expect(mockedAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMethod: 'mining',
        minLevel: 20,
        jobId: 'train_28_gearcrafting_d194',
      }),
    );
  });

  it('waits on the row the job already has rather than adding a second', async () => {
    const character = makeCharacter('train_28_gearcrafting_d194');
    const job = new TestObjective(character, 'craft_25_steel_bar');
    mockedFind.mockResolvedValue({
      id: 749,
      item_code: 'steel_bar',
      quantity: 25,
    } as WishlistRow);

    await job.requestIngredientFromWishlist({
      code: 'steel_bar',
      quantity: 25,
    });

    expect(mockedFind).toHaveBeenCalledWith({
      character: 'LongLegLarry',
      itemCode: 'steel_bar',
      jobId: 'train_28_gearcrafting_d194',
    });
    expect(mockedAdd).not.toHaveBeenCalled();
    expect(job.raisedBlockingRequest).toBe(true);
  });

  it('leaves a wish unowned so it parks nothing', async () => {
    const character = makeCharacter('train_28_gearcrafting_d194');
    const job = new UnownedRequestObjective(character, 'evaluate_gear');

    await job.requestIngredientFromWishlist({ code: 'gold_helm', quantity: 1 });

    expect(mockedAdd).toHaveBeenCalledWith({
      itemCode: 'gold_helm',
      quantity: 1,
      characterName: 'LongLegLarry',
      jobId: undefined,
    });
    expect(job.raisedBlockingRequest).toBe(false);
  });

  it('dedupes a wish against the unowned rows already asked for', async () => {
    const character = makeCharacter('train_28_gearcrafting_d194');
    const job = new UnownedRequestObjective(character, 'evaluate_gear');
    mockedFind.mockResolvedValue({ id: 1709, item_code: 'gold_helm' } as any);

    await job.requestIngredientFromWishlist({ code: 'gold_helm', quantity: 1 });

    expect(mockedFind).toHaveBeenCalledWith({
      character: 'LongLegLarry',
      itemCode: 'gold_helm',
      jobId: undefined,
    });
    expect(mockedAdd).not.toHaveBeenCalled();
    expect(job.raisedBlockingRequest).toBe(false);
  });
});
