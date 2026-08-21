import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 907),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
  dropUnclaimedWishlistRequest: jest.fn(async () => true),
}));

import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import {
  dropUnclaimedWishlistRequest,
  findOpenWishlistRequest,
} from '../../src/wishlist/wishlist.utils.js';
import { WishlistRow } from '../../src/wishlist/wishlist.types.js';

const mockedDrop = dropUnclaimedWishlistRequest as jest.MockedFunction<
  typeof dropUnclaimedWishlistRequest
>;
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
    data: { name: 'ChoppyChad' },
    jobList: [],
    wishlistRequestOwnerId,
  }) as any;

const openRow = (overrides?: Partial<WishlistRow>): WishlistRow =>
  ({
    id: 412,
    item_code: 'gold_shield',
    quantity: 1,
    character: 'ChoppyChad',
    job_id: null,
    executing: false,
    fulfilled: false,
    ...overrides,
  }) as WishlistRow;

describe('Objective.dropGrantedWishlistRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDrop.mockResolvedValue(true);
  });

  it('drops the wish once the character has the item another way', async () => {
    mockedFind.mockResolvedValue(openRow());
    const job = new UnownedRequestObjective(
      makeCharacter(),
      'evaluate_combat_gear',
    );

    await job.dropGrantedWishlistRequest('gold_shield', 1);

    expect(mockedFind).toHaveBeenCalledWith({
      character: 'ChoppyChad',
      itemCode: 'gold_shield',
    });
    expect(mockedDrop).toHaveBeenCalledWith(412, 'ChoppyChad');
  });

  it('leaves a claimed request alone so the fulfiller can still close it', async () => {
    mockedFind.mockResolvedValue(openRow({ executing: true }));
    const job = new UnownedRequestObjective(
      makeCharacter(),
      'evaluate_combat_gear',
    );

    await job.dropGrantedWishlistRequest('gold_shield', 1);

    expect(mockedDrop).not.toHaveBeenCalled();
  });

  it('keeps waiting when it holds fewer than it asked for', async () => {
    mockedFind.mockResolvedValue(
      openRow({ item_code: 'steel_bar', quantity: 25 }),
    );
    const job = new UnownedRequestObjective(
      makeCharacter(),
      'evaluate_combat_gear',
    );

    await job.dropGrantedWishlistRequest('steel_bar', 10);

    expect(mockedDrop).not.toHaveBeenCalled();
  });

  it('does nothing when there is no outstanding wish', async () => {
    mockedFind.mockResolvedValue(undefined);
    const job = new UnownedRequestObjective(
      makeCharacter(),
      'evaluate_combat_gear',
    );

    await job.dropGrantedWishlistRequest('gold_shield', 1);

    expect(mockedDrop).not.toHaveBeenCalled();
  });

  it('leaves a blocking request to the fulfiller, which has to mark it fulfilled', async () => {
    mockedFind.mockResolvedValue(openRow());
    const job = new TestObjective(
      makeCharacter('train_28_gearcrafting_d194'),
      'craft_1_gold_shield',
    );

    await job.dropGrantedWishlistRequest('gold_shield', 1);

    expect(mockedFind).not.toHaveBeenCalled();
    expect(mockedDrop).not.toHaveBeenCalled();
  });
});
