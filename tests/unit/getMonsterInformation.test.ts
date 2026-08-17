import { jest } from '@jest/globals';
import {
  clearMonsterCache,
  getAllMonsterInformation,
  getMonsterInformation,
} from '../../src/api_calls/Monsters.js';
import { ApiError } from '../../src/core/Error.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const monster = (code: string) => ({ code, name: code, level: 10 });

/** A catalogue entry with the fields the local filters read. */
const catalogueEntry = (
  code: string,
  name: string,
  level: number,
  drops: string[] = [],
) => ({
  code,
  name,
  level,
  drops: drops.map((dropCode) => ({
    code: dropCode,
    rate: 1,
    min_quantity: 1,
    max_quantity: 1,
  })),
});

const CATALOGUE = [
  catalogueEntry('chicken', 'Chicken', 1, ['egg', 'feather']),
  catalogueEntry('yellow_slime', 'Yellow Slime', 2, ['yellow_slimeball']),
  catalogueEntry('cow', 'Cow', 8, ['milk', 'feather']),
  catalogueEntry('ogre', 'Ogre', 20, ['ogre_eye']),
  catalogueEntry('spider', 'Spider', 20, ['spider_leg']),
];

function cataloguePage(entries: unknown[] = CATALOGUE): Response {
  return jsonResponse(200, {
    data: entries,
    total: entries.length,
    page: 1,
    size: 1000,
    pages: 1,
  });
}

describe('getMonsterInformation caching', () => {
  beforeEach(() => clearMonsterCache());
  afterEach(() => jest.restoreAllMocks());

  it('fetches on a cold cache and serves the second call from memory', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: monster('red_slime') }));

    const first = await getMonsterInformation('red_slime');
    const second = await getMonsterInformation('red_slime');

    expect(first).toEqual({ data: monster('red_slime') });
    expect(second).toEqual({ data: monster('red_slime') });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('is warmed in bulk by getAllMonsterInformation so single lookups make no call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: [monster('red_slime'), monster('highwayman')],
        total: 2,
        page: 1,
        size: 100,
        pages: 1,
      }),
    );

    await getAllMonsterInformation({ size: 100 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const result = await getMonsterInformation('highwayman');

    expect(result).toEqual({ data: monster('highwayman') });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no extra fetch for the lookup
  });

  it('does not cache errors, so a later call retries the request', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: monster('pig') }));

    const first = await getMonsterInformation('pig');
    const second = await getMonsterInformation('pig');

    expect(first).toBeInstanceOf(ApiError);
    expect(second).toEqual({ data: monster('pig') });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

/**
 * Filter semantics here were verified against the live API on 2026-08-17:
 * level bounds are inclusive at both ends, `drop` is an exact item-code match,
 * `name` is a case-insensitive substring match, and `/monsters` returns every
 * monster regardless of which events are running.
 */
describe('getAllMonsterInformation list caching', () => {
  beforeEach(() => clearMonsterCache());
  afterEach(() => jest.restoreAllMocks());

  it('fetches the catalogue once and serves later filtered queries from memory', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(cataloguePage());

    const first = await getAllMonsterInformation({ drop: 'egg' });
    const second = await getAllMonsterInformation({ max_level: 8 });
    const third = await getAllMonsterInformation({ drop: 'egg' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).not.toBeInstanceOf(ApiError);
    expect(second).not.toBeInstanceOf(ApiError);
    expect(third).not.toBeInstanceOf(ApiError);
  });

  it('requests the whole catalogue rather than the caller’s filter', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(cataloguePage());

    await getAllMonsterInformation({ drop: 'egg', max_level: 1 });

    const requestedUrl = String(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl).not.toContain('drop=');
    expect(requestedUrl).not.toContain('max_level=');
  });

  it('filters by drop on an exact item code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const result = await getAllMonsterInformation({ drop: 'feather' });

    if (result instanceof ApiError) throw result;
    expect(result.data.map((m) => m.code)).toEqual(['chicken', 'cow']);
    expect(result.total).toBe(2);
  });

  it('treats min_level and max_level as inclusive bounds', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const single = await getAllMonsterInformation({
      min_level: 8,
      max_level: 8,
    });
    const band = await getAllMonsterInformation({ min_level: 1, max_level: 2 });

    if (single instanceof ApiError) throw single;
    if (band instanceof ApiError) throw band;
    expect(single.data.map((m) => m.code)).toEqual(['cow']);
    expect(band.data.map((m) => m.code)).toEqual(['chicken', 'yellow_slime']);
  });

  it('matches name as a case-insensitive substring', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const result = await getAllMonsterInformation({ name: 'slime' });
    const cased = await getAllMonsterInformation({ name: 'ChIcK' });

    if (result instanceof ApiError) throw result;
    if (cased instanceof ApiError) throw cased;
    expect(result.data.map((m) => m.code)).toEqual(['yellow_slime']);
    expect(cased.data.map((m) => m.code)).toEqual(['chicken']);
  });

  it('combines filters the way the API does', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const result = await getAllMonsterInformation({
      drop: 'feather',
      max_level: 1,
    });

    if (result instanceof ApiError) throw result;
    expect(result.data.map((m) => m.code)).toEqual(['chicken']);
  });

  it('paginates with a default size of 50 and 1-based pages', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const defaulted = await getAllMonsterInformation({});
    const second = await getAllMonsterInformation({ size: 2, page: 2 });

    if (defaulted instanceof ApiError) throw defaulted;
    if (second instanceof ApiError) throw second;
    expect(defaulted).toMatchObject({ total: 5, page: 1, size: 50, pages: 1 });
    expect(defaulted.data).toHaveLength(5);
    expect(second).toMatchObject({ total: 5, page: 2, size: 2, pages: 3 });
    expect(second.data.map((m) => m.code)).toEqual(['cow', 'ogre']);
  });

  it('reports an empty match the way the API does', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(cataloguePage());

    const result = await getAllMonsterInformation({ drop: 'not_a_real_item' });

    if (result instanceof ApiError) throw result;
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      size: 50,
      pages: 0,
    });
  });

  it('follows pagination so a catalogue larger than one page is complete', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [CATALOGUE[0], CATALOGUE[1]],
          total: 3,
          page: 1,
          size: 2,
          pages: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [CATALOGUE[2]],
          total: 3,
          page: 2,
          size: 2,
          pages: 2,
        }),
      );

    const result = await getAllMonsterInformation({});

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    if (result instanceof ApiError) throw result;
    expect(result.data.map((m) => m.code)).toEqual([
      'chicken',
      'yellow_slime',
      'cow',
    ]);
  });

  it('does not cache a failed catalogue fetch', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(cataloguePage());

    const first = await getAllMonsterInformation({ drop: 'egg' });
    const second = await getAllMonsterInformation({ drop: 'egg' });

    expect(first).toBeInstanceOf(ApiError);
    if (second instanceof ApiError) throw second;
    expect(second.data.map((m) => m.code)).toEqual(['chicken']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('warms the by-code cache so single lookups make no further call', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(cataloguePage());

    await getAllMonsterInformation({ drop: 'egg' });
    const lookup = await getMonsterInformation('spider');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    if (lookup instanceof ApiError) throw lookup;
    expect(lookup.data.code).toBe('spider');
  });
});
