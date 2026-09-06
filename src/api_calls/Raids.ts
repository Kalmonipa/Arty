import { ApiUrl } from '../constants.js';
import { ApiError } from '../core/Error.js';
import {
  RaidScheduleSchema,
  RaidSchema,
  StaticDataPageRaidSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { apiRequest } from './request.js';

/** Comfortably above the handful of raids in the game, so one request covers it */
const RaidPageSize = 100;

/**
 * @description Every raid, with its schedule and the state of its current
 * instance.
 */
export async function getRaids(): Promise<RaidSchema[] | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/raids`);
  apiUrl.searchParams.set('size', RaidPageSize.toString());

  const response = await apiRequest<StaticDataPageRaidSchema>({
    url: apiUrl,
    fallbackMessage: 'Unknown error from /raids',
  });

  if (response instanceof ApiError) {
    return response;
  }

  return response.data;
}

/**
 * @description Looks a raid up by either name it goes by: `enchanted_fairy` is
 * the raid, and the code on its map; `pixie` is the monster the party actually
 * fights, and what the gear evaluation and the fight sim want. Callers hold one
 * or the other depending on where they got it, and both point at the same raid.
 * @returns the raid, or undefined if there is no such raid or it could not be read
 */
export async function findRaid(code: string): Promise<RaidSchema | undefined> {
  const raids = await getRaids();

  if (raids instanceof ApiError) {
    logger.warn(`Failed to read the raid list: ${raids.error.message}`);
    return undefined;
  }

  const raid = raids.find(
    (candidate) => candidate.code === code || candidate.monster === code,
  );

  if (!raid) {
    logger.warn(`No raid found for ${code}`);
  }

  return raid;
}

/**
 * @description A raid's static half: what it is, what it fights, and when it
 * opens. Deliberately carries no status or HP, so a cached one can never claim
 * a raid is running.
 */
export type RaidSchedule = {
  code: string;
  monster: string;
  schedule: RaidScheduleSchema;
};

let raidSchedules: RaidSchedule[] | undefined;

/** Test seam: drop the cached schedules so each test starts from a clean fetch */
export function clearRaidScheduleCache(): void {
  raidSchedules = undefined;
}

/**
 * @description Every raid's schedule, fetched once and held for the lifetime of
 * the process. A failed read is not cached, so the next caller tries again
 * rather than being told forever that there are no raids.
 */
export async function loadRaidSchedules(): Promise<RaidSchedule[]> {
  if (raidSchedules) {
    return raidSchedules;
  }

  const raids = await getRaids();
  if (raids instanceof ApiError) {
    logger.warn(`Failed to load raid schedules: ${raids.error.message}`);
    return [];
  }

  raidSchedules = raids.map((raid) => ({
    code: raid.code,
    monster: raid.monster,
    schedule: raid.schedule,
  }));

  logger.info(`Loaded ${raidSchedules.length} raid schedules`);
  return raidSchedules;
}
