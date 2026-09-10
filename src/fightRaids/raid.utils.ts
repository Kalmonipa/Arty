import { BouncyBella, JumpyJimmy } from '../constants.js';
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
 * Walks back over recent scheduled starts rather than asking whether the raid
 * opens today: a window runs for duration_hours and routinely spills past
 * midnight into a weekday the raid never opens on. The fairy opens 21:00 for 12
 * hours, so most of its window falls on the following day.
 */
export function raidWindowEnd(
  schedule: RaidScheduleSchema,
  now: Date = new Date(),
): Date | undefined {
  const durationMs = (schedule.duration_hours ?? 24) * HourMs;

  for (let daysAgo = 0; daysAgo <= MaxWindowDays; daysAgo++) {
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
    if (start <= now && now < end) {
      return end;
    }
  }

  return undefined;
}
