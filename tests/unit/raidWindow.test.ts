import {
  RaidPrepLeadSeconds,
  raidWindowEnd,
} from '../../src/fightRaids/raid.utils.js';
import { RaidScheduleSchema } from '../../src/types/types.js';

/** enchanted_fairy's live schedule: Tue/Thu/Sat/Sun, 21:00 UTC, 12 hours */
const fairy: RaidScheduleSchema = {
  weekdays: ['tuesday', 'thursday', 'saturday', 'sunday'],
  start_hour_utc: 21,
  start_minute_utc: 0,
  duration_hours: 12,
};

const at = (iso: string) => new Date(iso);

describe('raidWindowEnd', () => {
  it('is open the moment the window starts', () => {
    // Saturday 21:00 UTC
    expect(raidWindowEnd(fairy, at('2026-09-05T21:00:00Z'))).toEqual(
      at('2026-09-06T09:00:00Z'),
    );
  });

  it('is open part way through', () => {
    expect(raidWindowEnd(fairy, at('2026-09-05T23:30:00Z'))).toEqual(
      at('2026-09-06T09:00:00Z'),
    );
  });

  it('stays open past midnight, into a day the raid does not open on', () => {
    // Sunday 08:59 UTC is still inside Saturday's 12-hour window. Asking only
    // "does the raid open today" would close it seven hours early
    expect(raidWindowEnd(fairy, at('2026-09-06T08:59:00Z'))).toEqual(
      at('2026-09-06T09:00:00Z'),
    );
  });

  it('is shut once the window has run its course', () => {
    expect(raidWindowEnd(fairy, at('2026-09-06T09:00:00Z'))).toBeUndefined();
  });

  it('is shut before the window opens', () => {
    // Saturday 20:59, a minute early
    expect(raidWindowEnd(fairy, at('2026-09-05T20:59:00Z'))).toBeUndefined();
  });

  it('is shut on a day the raid never opens', () => {
    // Monday, which is not in the schedule
    expect(raidWindowEnd(fairy, at('2026-09-07T22:00:00Z'))).toBeUndefined();
  });

  it('opens on each of its weekdays', () => {
    // Tue 8th, Thu 10th, Sat 12th, Sun 13th September 2026
    for (const day of ['08', '10', '12', '13']) {
      expect(
        raidWindowEnd(fairy, at(`2026-09-${day}T22:00:00Z`)),
      ).toBeDefined();
    }
    // Mon 7th, Wed 9th, Fri 11th
    for (const day of ['07', '09', '11']) {
      expect(
        raidWindowEnd(fairy, at(`2026-09-${day}T22:00:00Z`)),
      ).toBeUndefined();
    }
  });

  it('honours the minute the window opens on', () => {
    const halfPast = { ...fairy, start_minute_utc: 30 };

    expect(raidWindowEnd(halfPast, at('2026-09-05T21:15:00Z'))).toBeUndefined();
    expect(raidWindowEnd(halfPast, at('2026-09-05T21:30:00Z'))).toEqual(
      at('2026-09-06T09:30:00Z'),
    );
  });

  it('handles a window that runs for days', () => {
    // The schema allows up to 168 hours, so a window can span a whole week
    const weekLong: RaidScheduleSchema = {
      weekdays: ['monday'],
      start_hour_utc: 0,
      start_minute_utc: 0,
      duration_hours: 168,
    };

    expect(raidWindowEnd(weekLong, at('2026-09-10T12:00:00Z'))).toEqual(
      at('2026-09-14T00:00:00Z'),
    );
  });

  it('falls back to the schema defaults when the hours are absent', () => {
    // start_hour_utc, start_minute_utc and duration_hours are all optional
    const bare: RaidScheduleSchema = { weekdays: ['sunday'] };

    expect(raidWindowEnd(bare, at('2026-09-06T12:00:00Z'))).toEqual(
      at('2026-09-07T00:00:00Z'),
    );
    expect(raidWindowEnd(bare, at('2026-09-07T00:00:00Z'))).toBeUndefined();
  });
});

describe('raidWindowEnd with a lead time', () => {
  // A raid's usable life is the fifteen-odd minutes before the server drains the
  // shared pool. Gearing and travelling only once the doors open spent five of
  // them, so the party sets off before the window starts.
  const lead = RaidPrepLeadSeconds;

  /** Saturday's 21:00 opening, offset by seconds */
  const beforeOpening = (seconds: number) =>
    new Date(at('2026-09-05T21:00:00Z').getTime() - seconds * 1000);

  it('counts the window as reachable the moment the lead time starts', () => {
    expect(raidWindowEnd(fairy, beforeOpening(lead), lead)).toEqual(
      at('2026-09-06T09:00:00Z'),
    );
  });

  it('is still shut a second before the lead time', () => {
    expect(raidWindowEnd(fairy, beforeOpening(lead + 1), lead)).toBeUndefined();
  });

  it('leaves an open window reading exactly as it did', () => {
    expect(raidWindowEnd(fairy, at('2026-09-05T23:30:00Z'), lead)).toEqual(
      raidWindowEnd(fairy, at('2026-09-05T23:30:00Z')),
    );
  });

  it('does not reach into a day the raid never opens on', () => {
    // Sunday's lead-in runs into Sunday 21:00, which the fairy does open
    expect(
      raidWindowEnd(
        fairy,
        new Date(beforeOpening(lead).getTime() + DayMs),
        lead,
      ),
    ).toBeDefined();
    // Monday's leads nowhere
    expect(
      raidWindowEnd(
        fairy,
        new Date(beforeOpening(lead).getTime() + 2 * DayMs),
        lead,
      ),
    ).toBeUndefined();
  });

  const DayMs = 24 * 60 * 60 * 1000;

  it('reaches a window that opens just after midnight', () => {
    const midnightRaid: RaidScheduleSchema = {
      weekdays: ['sunday'],
      start_hour_utc: 0,
      start_minute_utc: 2,
      duration_hours: 12,
    };

    // Late on Saturday, inside the lead-in for Sunday 00:02
    const justBefore = new Date(
      at('2026-09-06T00:02:00Z').getTime() - (lead - 60) * 1000,
    );
    expect(raidWindowEnd(midnightRaid, justBefore, lead)).toEqual(
      at('2026-09-06T12:02:00Z'),
    );
  });

  it('changes nothing without a lead time', () => {
    expect(raidWindowEnd(fairy, beforeOpening(lead))).toBeUndefined();
  });
});
