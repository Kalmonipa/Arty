import {
  BouncyBella,
  JumpyJimmy,
  RaidCheckIntervalSeconds,
} from '../constants.js';
import {
  BossFightHealer,
  BossFightParticipant,
  BossFightTank,
} from '../fightBosses/bossFight.types.js';
import {
  RaidScheduleSchema,
  RaidSchema,
  RaidStatus,
  RaidWeekday,
} from '../types/types.js';

/**
 * @description A raid is won by lasting 100 turns, and a turn belongs to one
 * actor: with three characters the boss lands only a quarter of them, and it
 * lands all of those on whoever holds the highest threat. So the leader tanks
 * alone and the other two heal it.
 *
 * Three equal tanks looks safer and is not. The boss spreads its attacks across
 * the party, every character then has to fund its own restores out of two
 * utility slots, and none of them can spare a slot for splash healing. One
 * committed tank fed by two healers simulated at a hundred percent on the same
 * gear that scored sixty as three tanks.
 */
export const RaidLeaderRole = BossFightTank;

export const RaidRoster: BossFightParticipant[] = [
  { characterName: BouncyBella, role: BossFightHealer },
  { characterName: JumpyJimmy, role: BossFightHealer },
];

/**
 * @description How many fights the party may lose back to back before the
 * leader aborts it
 */
export const RaidLossLimit = 3;

/**
 * @description Win percentage threshold before starting a raid
 */
export const RaidWinRateThreshold = 50;

/** How many fights to simulate before committing the party to a raid */
export const RaidSimIterations = 10;

/**
 * @description API error codes worth another go rather than standing the party
 * down.
 *
 * A raid's usable window is the fifteen-odd minutes before the rest of the
 * server drains the shared pool, not the twelve hours it is scheduled for, so a
 * blip that costs ten seconds is cheap and giving up costs the whole night. On
 * 2026-09-12 a single 486 one fight in ended the raid; the boss died to other
 * players eight minutes later.
 *
 * 486 another action already in flight for the character, 499 a cooldown that
 * has not quite elapsed, 598 the monster not on the map yet, 500/502 the server
 * having a moment, 599 a transport blip.
 */
export const RaidTransientErrorCodes = new Set([486, 499, 598, 500, 502, 599]);

/** How many times to call the fight before accepting it will not start */
export const RaidFightAttempts = 3;

/** How long to wait between those attempts */
export const RaidRetryDelaySeconds = 10;

/**
 * @description How long before a window opens the party starts getting ready.
 *
 * Gearing up, walking to the map and mustering took five minutes of the
 * 2026-09-12 window, which the rest of the server had drained inside eighteen.
 * Starting that before the doors open buys the whole of it back.
 *
 * Twice {@link RaidCheckIntervalSeconds} rather than the five minutes it is
 * worth: the leader only looks for a window every five minutes, so a five minute
 * lead could be missed entirely — a check at 20:54 and the next at 20:59 leaves
 * one minute to get ready. At ten minutes, some check always lands at least five
 * minutes out, and the party waits at the map for the rest.
 */
export const RaidPrepLeadSeconds = 2 * RaidCheckIntervalSeconds;

/** How often to re-read a raid while waiting at the map for it to open */
export const RaidOpenPollSeconds = 10;

/**
 * @description How long to stand at the map waiting for a window that should be
 * about to open, before accepting it is not going to.
 */
export const RaidOpenWaitSeconds = RaidPrepLeadSeconds + 120;

/**
 * @description Whether a raid that is not open yet is about to be, so the party
 * can gear up and travel in time to fight on the minute it opens.
 *
 * Reads `next_start_at` off the raid rather than recomputing from the schedule:
 * it is the server's own answer and cannot drift from it.
 */
export function raidOpensWithin(
  raid: RaidSchema | undefined,
  seconds: number,
  now: Date = new Date(),
): boolean {
  if (!raid?.next_start_at) return false;

  const opensIn = new Date(raid.next_start_at).getTime() - now.getTime();
  return opensIn > 0 && opensIn <= seconds * 1000;
}

/**
 * @description Whether the raid is open and its boss still standing. Anything
 * else — not open yet, already killed, or the event has finished — means there is
 * nothing left to fight.
 */
export function isRaidRunning(raid: RaidSchema | undefined): boolean {
  return raid?.status === RaidStatus.active;
}

/** Weekday names as the schedule spells them, indexed by Date#getUTCDay */
const WeekdayNames: RaidWeekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** The schema caps a window at 168 hours, so no start more than 7 days old can still be open */
const MaxWindowDays = 7;

const HourMs = 60 * 60 * 1000;

/**
 * @description When the raid's current window closes, or undefined if it is not
 * open right now.
 *
 * With a `leadSeconds` the window also counts as reachable that long before it
 * opens, so the party can be geared and standing on the map by the time it does.
 *
 * Walks back over recent scheduled starts rather than asking whether the raid
 * opens today: a window runs for duration_hours and routinely spills past
 * midnight into a weekday the raid never opens on. The fairy opens 21:00 for 12
 * hours, so most of its window falls on the following day.
 */
export function raidWindowEnd(
  schedule: RaidScheduleSchema,
  now: Date = new Date(),
  leadSeconds = 0,
): Date | undefined {
  const durationMs = (schedule.duration_hours ?? 24) * HourMs;
  const leadMs = leadSeconds * 1000;

  // Starts at -1 so a window opening just after midnight is still reachable from
  // the lead time on the day before
  for (let daysAgo = -1; daysAgo <= MaxWindowDays; daysAgo++) {
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        schedule.start_hour_utc ?? 0,
        schedule.start_minute_utc ?? 0,
      ),
    );

    if (!schedule.weekdays.includes(WeekdayNames[start.getUTCDay()])) {
      continue;
    }

    const end = new Date(start.getTime() + durationMs);
    if (start.getTime() - leadMs <= now.getTime() && now < end) {
      return end;
    }
  }

  return undefined;
}
