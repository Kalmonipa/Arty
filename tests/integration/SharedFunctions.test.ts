import { jest } from '@jest/globals';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
} from '../../src/idleObjectives/idleUtils.js';
import { GetCharacterData } from '../../src/utils.js';
import { CharacterSchema } from '../../src/types/types.js';
import {
  deleteExpiredWishlistRequests,
  deleteOrphanedWishlistRequests,
  getWishlistRequestsForJob,
  deleteWishlistRequest,
} from '../../src/wishlist/functions.js';

jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return {
    ...actual,
    GetCharacterData: jest.fn(),
    logger: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

jest.mock('../../src/wishlist/functions.js', () => ({
  deleteExpiredWishlistRequests: jest.fn(async () => 0),
  deleteOrphanedWishlistRequests: jest.fn(async () => 0),
  getWishlistRequestsForJob: jest.fn(async () => []),
  deleteWishlistRequest: jest.fn(async () => true),
}));

const mockedGetCharacterData = GetCharacterData as jest.MockedFunction<
  typeof GetCharacterData
>;
const mockedDeleteExpired =
  deleteExpiredWishlistRequests as jest.MockedFunction<
    typeof deleteExpiredWishlistRequests
  >;
const mockedRequestsForJob = getWishlistRequestsForJob as jest.MockedFunction<
  typeof getWishlistRequestsForJob
>;
const mockedDeleteOrphaned =
  deleteOrphanedWishlistRequests as jest.MockedFunction<
    typeof deleteOrphanedWishlistRequests
  >;
const mockedDeleteRequest = deleteWishlistRequest as jest.MockedFunction<
  typeof deleteWishlistRequest
>;

class MockOnHoldCharacter {
  data = { name: 'TimidTom' };
  onHold: any[] = [];
  activeJobIds = jest.fn(() =>
    this.onHold.map((entry) => entry.job.objectiveId),
  );
  resumeOnHoldJob = jest.fn(async (entry: any) => {
    this.onHold = this.onHold.filter((e) => e !== entry);
  });
  dropOnHoldJob = jest.fn(async (entry: any) => {
    this.onHold = this.onHold.filter((e) => e !== entry);
  });
  markOnHoldRetried = jest.fn();
  clearOnHoldRetried = jest.fn();
}

function rows(...specs: [number, boolean][]) {
  return specs.map(([id, fulfilled]) => ({
    id,
    item_code: `item_${id}`,
    quantity: id,
    fulfilled,
  })) as any;
}

function onHoldEntry(overrides: Partial<any> = {}) {
  return {
    job: { objectiveId: 'craft_5_iron_sword_abcd' },
    parkedAt: '2026-07-14T00:00:00.000Z',
    retried: false,
    ...overrides,
  };
}

class MockCharacter {
  data = { level: 30 };
  highestCharLevel = 0;
  trainCombatLevelNow = jest.fn(async () => ObjectiveCompleted);
}

describe('checkWithinLevelRange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets highestCharLevel from all characters and returns true when in range', async () => {
    mockedGetCharacterData.mockResolvedValue([
      { level: 30 },
      { level: 35 },
    ] as CharacterSchema[]);

    const character = new MockCharacter();

    const result = await checkWithinLevelRange(character as any);

    expect(result.success).toBe(true);
    expect(character.highestCharLevel).toBe(35);
    expect(character.trainCombatLevelNow).not.toHaveBeenCalled();
  });

  it('trains when the character is more than 10 levels behind the leader', async () => {
    mockedGetCharacterData.mockResolvedValue([
      { level: 20 },
      { level: 40 },
    ] as CharacterSchema[]);

    const character = new MockCharacter();
    character.data.level = 20;

    await checkWithinLevelRange(character as any);

    expect(character.highestCharLevel).toBe(40);
    expect(character.trainCombatLevelNow).toHaveBeenCalledWith(30);
  });
});

describe('checkOnHoldQueue', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always sweeps expired wishlist requests', async () => {
    const character = new MockOnHoldCharacter();

    await checkOnHoldQueue(character as any);

    expect(mockedDeleteExpired).toHaveBeenCalledTimes(1);
  });

  it('clears requests left behind by a job that is no longer queued or parked', async () => {
    const character = new MockOnHoldCharacter();
    character.onHold = [onHoldEntry()];
    mockedRequestsForJob.mockResolvedValue(rows([1, false]));

    await checkOnHoldQueue(character as any);

    // Parked jobs count as active, or this would delete what they wait on
    expect(mockedDeleteOrphaned).toHaveBeenCalledWith('TimidTom', [
      'craft_5_iron_sword_abcd',
    ]);
  });

  it('resumes a job and cleans up its rows once every request is fulfilled', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry();
    character.onHold = [entry];
    mockedRequestsForJob.mockResolvedValue(rows([1, true], [2, true]));

    await checkOnHoldQueue(character as any);

    expect(mockedRequestsForJob).toHaveBeenCalledWith(
      'TimidTom',
      'craft_5_iron_sword_abcd',
    );
    expect(character.resumeOnHoldJob).toHaveBeenCalledWith(entry);
    expect(mockedDeleteRequest).toHaveBeenCalledWith(1);
    expect(mockedDeleteRequest).toHaveBeenCalledWith(2);
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('keeps waiting while a request exists but is not yet fulfilled', async () => {
    const character = new MockOnHoldCharacter();
    character.onHold = [onHoldEntry()];
    mockedRequestsForJob.mockResolvedValue(rows([1, true], [2, false]));

    await checkOnHoldQueue(character as any);

    expect(character.resumeOnHoldJob).not.toHaveBeenCalled();
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('retries once when the requests it was waiting on have gone', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry({ retried: false });
    character.onHold = [entry];
    mockedRequestsForJob.mockResolvedValue([]);

    await checkOnHoldQueue(character as any);

    expect(character.markOnHoldRetried).toHaveBeenCalledWith(
      'craft_5_iron_sword_abcd',
    );
    expect(character.resumeOnHoldJob).toHaveBeenCalledWith(entry);
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('drops a job whose requests are gone after it was already retried', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry({ retried: true });
    character.onHold = [entry];
    mockedRequestsForJob.mockResolvedValue([]);

    await checkOnHoldQueue(character as any);

    expect(character.dropOnHoldJob).toHaveBeenCalledWith(entry);
    expect(character.resumeOnHoldJob).not.toHaveBeenCalled();
  });
});
