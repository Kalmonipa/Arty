import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Raids.js', () => ({
  loadRaidSchedules: jest.fn(),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { loadRaidSchedules } from '../../src/api_calls/Raids.js';
import { Character } from '../../src/character/character.js';
import { RaidLeaderObjective } from '../../src/fightRaids/raidLeader.objective.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const mockedSchedules = loadRaidSchedules as jest.MockedFunction<
  typeof loadRaidSchedules
>;

const fairy = {
  code: 'enchanted_fairy',
  monster: 'pixie',
  schedule: {
    weekdays: ['saturday'],
    start_hour_utc: 21,
    start_minute_utc: 0,
    duration_hours: 12,
  },
};

const sun = {
  code: 'god_of_the_sun',
  monster: 'sonnengott',
  schedule: {
    weekdays: ['saturday'],
    start_hour_utc: 21,
    start_minute_utc: 0,
    duration_hours: 12,
  },
};

/** Saturday 5 September 2026, two hours into the window */
const IN_WINDOW = new Date('2026-09-05T23:00:00Z');
/** Sunday morning, an hour after it shut */
const AFTER_WINDOW = new Date('2026-09-06T10:00:00Z');

describe('checking for an open raid window', () => {
  let character: Character;
  let executed: unknown[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(IN_WINDOW);

    executed = [];
    character = new Character({ ...mockCharacterData, name: 'LongLegLarry' });
    character.role = 'crafter';
    character.executeJobNow = jest.fn(async (job: unknown) => {
      executed.push(job);
      return ObjectiveCompleted;
    }) as never;

    mockedSchedules.mockResolvedValue([fairy] as never);
  });

  afterEach(() => jest.useRealTimers());

  it('leads the raid when the window is open', async () => {
    await character.checkForRaidWindow();

    expect(executed).toHaveLength(1);
    expect(executed[0]).toBeInstanceOf(RaidLeaderObjective);
    expect((executed[0] as RaidLeaderObjective).target).toEqual({
      code: 'enchanted_fairy',
    });
  });

  it('does nothing outside the window', async () => {
    jest.setSystemTime(AFTER_WINDOW);

    await character.checkForRaidWindow();

    expect(executed).toHaveLength(0);
  });

  it('is the job of the crafter alone', async () => {
    character.role = 'labourer';

    await character.checkForRaidWindow();

    expect(executed).toHaveLength(0);
    expect(mockedSchedules).not.toHaveBeenCalled();
  });

  it('does not check again within the throttle', async () => {
    await character.checkForRaidWindow();
    await character.checkForRaidWindow();

    expect(executed).toHaveLength(1);
  });

  it('does not stack a second raid on one already queued', async () => {
    character.jobList = [
      new RaidLeaderObjective(character, { code: 'enchanted_fairy' }),
    ];

    await character.checkForRaidWindow();

    expect(executed).toHaveLength(0);
  });

  it('gives up on a raid that failed, for the rest of its window', async () => {
    character.executeJobNow = jest.fn(async (job: unknown) => {
      executed.push(job);
      return ObjectiveFailed;
    }) as never;

    await character.checkForRaidWindow();
    expect(executed).toHaveLength(1);

    // Well past the throttle, still inside the same window
    jest.setSystemTime(new Date('2026-09-06T02:00:00Z'));
    await character.checkForRaidWindow();

    expect(executed).toHaveLength(1);
  });

  it('tries again once the next window comes round', async () => {
    character.executeJobNow = jest.fn(async (job: unknown) => {
      executed.push(job);
      return ObjectiveFailed;
    }) as never;

    await character.checkForRaidWindow();
    expect(executed).toHaveLength(1);

    // The following Saturday
    jest.setSystemTime(new Date('2026-09-12T23:00:00Z'));
    await character.checkForRaidWindow();

    expect(executed).toHaveLength(2);
  });

  it('writing one raid off does not write off the other', async () => {
    mockedSchedules.mockResolvedValue([fairy, sun] as never);
    character.executeJobNow = jest.fn(async (job: RaidLeaderObjective) => {
      executed.push(job);
      return job.target.code === 'enchanted_fairy'
        ? ObjectiveFailed
        : ObjectiveCompleted;
    }) as never;

    await character.checkForRaidWindow();
    jest.setSystemTime(new Date('2026-09-06T02:00:00Z'));
    await character.checkForRaidWindow();

    const attempted = executed.map(
      (job) => (job as RaidLeaderObjective).target.code,
    );
    expect(attempted.filter((code) => code === 'enchanted_fairy')).toHaveLength(
      1,
    );
    expect(attempted.filter((code) => code === 'god_of_the_sun').length).
      toBeGreaterThan(1);
  });
});
