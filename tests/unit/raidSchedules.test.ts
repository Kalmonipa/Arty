import { jest } from '@jest/globals';
import {
  clearRaidScheduleCache,
  loadRaidSchedules,
} from '../../src/api_calls/Raids.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const RAIDS = [
  {
    code: 'enchanted_fairy',
    monster: 'pixie',
    status: 'active',
    schedule: {
      weekdays: ['tuesday', 'thursday', 'saturday', 'sunday'],
      start_hour_utc: 21,
      start_minute_utc: 0,
      duration_hours: 12,
    },
  },
  {
    code: 'god_of_the_sun',
    monster: 'sonnengott',
    status: 'upcoming',
    schedule: {
      weekdays: ['monday', 'friday'],
      start_hour_utc: 21,
      start_minute_utc: 0,
      duration_hours: 12,
    },
  },
];

const raidsPage = () =>
  jsonResponse(200, { data: RAIDS, total: 2, page: 1, size: 100, pages: 1 });

describe('loadRaidSchedules', () => {
  beforeEach(() => clearRaidScheduleCache());
  afterEach(() => jest.restoreAllMocks());

  it('reports each raid with the schedule it opens on', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    await expect(loadRaidSchedules()).resolves.toEqual([
      {
        code: 'enchanted_fairy',
        monster: 'pixie',
        schedule: RAIDS[0].schedule,
      },
      {
        code: 'god_of_the_sun',
        monster: 'sonnengott',
        schedule: RAIDS[1].schedule,
      },
    ]);
  });

  it('fetches once and serves every later call from memory', async () => {
    // Schedules are static, unlike the status and HP that findRaid reads
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(raidsPage());

    await loadRaidSchedules();
    await loadRaidSchedules();
    await loadRaidSchedules();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps no status, so a stale cache cannot claim a raid is running', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    const schedules = await loadRaidSchedules();

    expect(schedules[0]).not.toHaveProperty('status');
  });

  it('caches nothing when the list cannot be read', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: 'boom' } }))
      .mockResolvedValue(raidsPage());

    await expect(loadRaidSchedules()).resolves.toEqual([]);

    // The next call has to try again rather than serve an empty list forever
    await expect(loadRaidSchedules()).resolves.toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
