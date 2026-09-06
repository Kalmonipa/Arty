import { jest } from '@jest/globals';
import { findRaid, getRaids } from '../../src/api_calls/Raids.js';
import { ApiError } from '../../src/core/Error.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * The live shape as of 2026-09-06: the raid is named one thing and the monster
 * the party actually fights is named another.
 */
const RAIDS = [
  {
    code: 'enchanted_fairy',
    name: 'Enchanted Fairy',
    monster: 'pixie',
    status: 'finished_success',
  },
  {
    code: 'god_of_the_sun',
    name: 'God of the Sun',
    monster: 'sonnengott',
    status: 'active',
  },
];

function raidsPage(entries: unknown[] = RAIDS): Response {
  return jsonResponse(200, {
    data: entries,
    total: entries.length,
    page: 1,
    size: 100,
    pages: 1,
  });
}

describe('findRaid', () => {
  afterEach(() => jest.restoreAllMocks());

  it('finds a raid by its own code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    expect(await findRaid('enchanted_fairy')).toEqual(RAIDS[0]);
  });

  it('finds a raid by the monster the party fights', async () => {
    // The map content is the raid code and the gear evaluation wants the
    // monster, so callers hold one or the other depending on where they got it
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    expect(await findRaid('pixie')).toEqual(RAIDS[0]);
  });

  it('finds nothing for a monster that is not a raid boss', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    expect(await findRaid('lich')).toBeUndefined();
  });

  it('reports nothing rather than a stale answer when the list cannot be read', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(500, { error: { message: 'boom' } }));

    expect(await findRaid('pixie')).toBeUndefined();
  });

  it('reads the list fresh every time', async () => {
    // status and remaining_hp are the whole reason to ask, and they change
    // while the raid runs, so this is the one catalogue that must not be cached
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(raidsPage());

    await findRaid('pixie');
    await findRaid('pixie');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('getRaids', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns every raid', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(raidsPage());

    expect(await getRaids()).toEqual(RAIDS);
  });

  it('hands back the error rather than an empty list', async () => {
    // An empty list and a failed read mean opposite things to a leader deciding
    // whether to stand its party down
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(500, { error: { message: 'boom' } }));

    expect(await getRaids()).toBeInstanceOf(ApiError);
  });
});
