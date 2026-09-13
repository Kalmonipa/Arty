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
import { RaidCheckIntervalSeconds } from '../../src/constants.js';

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
/** Saturday 20:55, five minutes before the doors open */
const DURING_LEAD_IN = new Date('2026-09-05T20:55:00Z');
/** Saturday 20:45, before the party has any business getting ready */
const BEFORE_LEAD_IN = new Date('2026-09-05T20:45:00Z');

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
    expect(
      attempted.filter((code) => code === 'god_of_the_sun').length,
    ).toBeGreaterThan(1);
  });
  describe('a raid that stopped for a transient reason', () => {
    /** Fails the raid the way a blip does: no verdict on whether it can be won */
    const failTransiently = () => {
      character.executeJobNow = jest.fn(async (job: unknown) => {
        executed.push(job);
        (job as RaidLeaderObjective).failedTransiently = true;
        return ObjectiveFailed;
      }) as never;
    };

    /** Far enough on that the routine check is due again */
    const afterTheNextCheck = () =>
      jest.setSystemTime(
        new Date(IN_WINDOW.getTime() + (RaidCheckIntervalSeconds + 30) * 1000),
      );

    it('is led again at the next check rather than written off for the window', async () => {
      failTransiently();

      await character.checkForRaidWindow();
      expect(executed).toHaveLength(1);

      afterTheNextCheck();
      await character.checkForRaidWindow();

      expect(executed).toHaveLength(2);
    });

    it('records no write-off at all, so nothing has to expire first', async () => {
      failTransiently();

      await character.checkForRaidWindow();

      expect(character.raidBackoffs.has('enchanted_fairy')).toBe(false);
    });

    it('still writes off a raid that failed on its merits', async () => {
      character.executeJobNow = jest.fn(async (job: unknown) => {
        executed.push(job);
        (job as RaidLeaderObjective).failedTransiently = false;
        return ObjectiveFailed;
      }) as never;

      await character.checkForRaidWindow();

      afterTheNextCheck();
      await character.checkForRaidWindow();

      expect(executed).toHaveLength(1);
    });
  });
  describe('getting ready before the doors open', () => {
    /**
     * The character reads the clock when it is built, so it has to be rebuilt at
     * the moment under test or its own check throttle sits in the future
     */
    const atTime = (when: Date) => {
      jest.setSystemTime(when);
      executed = [];
      character = new Character({ ...mockCharacterData, name: 'LongLegLarry' });
      character.role = 'crafter';
      character.executeJobNow = jest.fn(async (job: unknown) => {
        executed.push(job);
        return ObjectiveCompleted;
      }) as never;
    };

    // Gearing up and walking to the map cost five minutes of the 2026-09-12
    // window, which other players had finished off inside eighteen
    it('leads the raid during the lead-in, before the window opens', async () => {
      atTime(DURING_LEAD_IN);

      await character.checkForRaidWindow();

      expect(executed).toHaveLength(1);
      expect(executed[0]).toBeInstanceOf(RaidLeaderObjective);
    });

    it('does nothing before the lead-in starts', async () => {
      atTime(BEFORE_LEAD_IN);

      await character.checkForRaidWindow();

      expect(executed).toHaveLength(0);
    });

    it('still writes a lead-in failure off against the window it leads into', async () => {
      atTime(DURING_LEAD_IN);
      character.executeJobNow = jest.fn(async (job: unknown) => {
        executed.push(job);
        (job as RaidLeaderObjective).failedTransiently = false;
        return ObjectiveFailed;
      }) as never;

      await character.checkForRaidWindow();

      // Written off until the window shuts, not until the lead-in ends
      expect(character.raidBackoffs.get('enchanted_fairy')).toBe(
        Math.round(new Date('2026-09-06T09:00:00Z').getTime() / 1000),
      );
    });
  });
});
