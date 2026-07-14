import { jest } from '@jest/globals';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
} from '../../src/idleObjectives/idleUtils.js';
import { GetCharacterData } from '../../src/utils.js';
import { CharacterSchema } from '../../src/types/types.js';
import {
  deleteExpiredWishlistRequests,
  getWishlistRequestsByIds,
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
  getWishlistRequestsByIds: jest.fn(async () => []),
  deleteWishlistRequest: jest.fn(async () => true),
}));

const mockedGetCharacterData = GetCharacterData as jest.MockedFunction<
  typeof GetCharacterData
>;
const mockedDeleteExpired =
  deleteExpiredWishlistRequests as jest.MockedFunction<
    typeof deleteExpiredWishlistRequests
  >;
const mockedGetByIds = getWishlistRequestsByIds as jest.MockedFunction<
  typeof getWishlistRequestsByIds
>;
const mockedDeleteRequest = deleteWishlistRequest as jest.MockedFunction<
  typeof deleteWishlistRequest
>;

class MockOnHoldCharacter {
  onHold: any[] = [];
  resumeOnHoldJob = jest.fn(async (entry: any) => {
    this.onHold = this.onHold.filter((e) => e !== entry);
  });
  dropOnHoldJob = jest.fn(async (entry: any) => {
    this.onHold = this.onHold.filter((e) => e !== entry);
  });
  markOnHoldRetried = jest.fn();
  clearOnHoldRetried = jest.fn();
}

function onHoldEntry(overrides: Partial<any> = {}) {
  return {
    job: { objectiveId: 'craft_5_iron_sword_abcd' },
    waitingOn: [1, 2],
    parkedAt: '2026-07-14T00:00:00.000Z',
    retried: false,
    ...overrides,
  };
}

class MockCharacter {
  data = { level: 30 };
  highestCharLevel = 0;
  trainCombatLevelNow = jest.fn(async () => true);
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

    expect(result).toBe(true);
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

  it('resumes a job and cleans up its rows once every request is fulfilled', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry({ waitingOn: [1, 2] });
    character.onHold = [entry];
    mockedGetByIds.mockResolvedValue([
      { id: 1, fulfilled: true },
      { id: 2, fulfilled: true },
    ] as any);

    await checkOnHoldQueue(character as any);

    expect(character.resumeOnHoldJob).toHaveBeenCalledWith(entry);
    expect(mockedDeleteRequest).toHaveBeenCalledWith(1);
    expect(mockedDeleteRequest).toHaveBeenCalledWith(2);
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('keeps waiting while a request exists but is not yet fulfilled', async () => {
    const character = new MockOnHoldCharacter();
    character.onHold = [onHoldEntry({ waitingOn: [1, 2] })];
    mockedGetByIds.mockResolvedValue([
      { id: 1, fulfilled: true },
      { id: 2, fulfilled: false },
    ] as any);

    await checkOnHoldQueue(character as any);

    expect(character.resumeOnHoldJob).not.toHaveBeenCalled();
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('retries once when a request has disappeared', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry({ waitingOn: [1, 2], retried: false });
    character.onHold = [entry];
    mockedGetByIds.mockResolvedValue([{ id: 1, fulfilled: true }] as any); // id 2 gone

    await checkOnHoldQueue(character as any);

    expect(character.markOnHoldRetried).toHaveBeenCalledWith(
      'craft_5_iron_sword_abcd',
    );
    expect(character.resumeOnHoldJob).toHaveBeenCalledWith(entry);
    expect(character.dropOnHoldJob).not.toHaveBeenCalled();
  });

  it('drops a job whose request disappeared after it was already retried', async () => {
    const character = new MockOnHoldCharacter();
    const entry = onHoldEntry({ waitingOn: [1, 2], retried: true });
    character.onHold = [entry];
    mockedGetByIds.mockResolvedValue([{ id: 1, fulfilled: true }] as any); // id 2 gone

    await checkOnHoldQueue(character as any);

    expect(character.dropOnHoldJob).toHaveBeenCalledWith(entry);
    expect(character.resumeOnHoldJob).not.toHaveBeenCalled();
  });
});
