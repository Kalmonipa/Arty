import { jest } from '@jest/globals';
import {
  clearResourceCache,
  getAllResourceInformation,
  getResourceInformation,
} from '../../src/api_calls/Resources.js';
import {
  clearNpcItemsCache,
  getAllNpcItems,
  getNpcItems,
} from '../../src/api_calls/NPC.js';
import { ApiError } from '../../src/core/Error.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('resource caching', () => {
  const resource = (code: string) => ({ code, name: code, skill: 'mining' });

  beforeEach(() => clearResourceCache());
  afterEach(() => jest.restoreAllMocks());

  it('fetches once then serves the second lookup from memory', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: resource('copper_rocks') }));

    const first = await getResourceInformation('copper_rocks');
    const second = await getResourceInformation('copper_rocks');

    expect(first).toEqual({ data: resource('copper_rocks') });
    expect(second).toEqual({ data: resource('copper_rocks') });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('is warmed in bulk by getAllResourceInformation', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: [resource('copper_rocks'), resource('iron_rocks')],
        total: 2,
        page: 1,
        size: 100,
        pages: 1,
      }),
    );

    await getAllResourceInformation({ size: 100 });
    const result = await getResourceInformation('iron_rocks');

    expect(result).toEqual({ data: resource('iron_rocks') });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache errors', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: resource('gold_rocks') }),
      );

    const first = await getResourceInformation('gold_rocks');
    const second = await getResourceInformation('gold_rocks');

    expect(first).toBeInstanceOf(ApiError);
    expect(second).toEqual({ data: resource('gold_rocks') });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('NPC item caching', () => {
  const page = (codes: string[]) => ({
    data: codes.map((code) => ({ code, npc: 'merchant' })),
    total: codes.length,
    page: 1,
    size: 50,
    pages: 1,
  });

  beforeEach(() => clearNpcItemsCache());
  afterEach(() => jest.restoreAllMocks());

  it('caches getAllNpcItems responses by request URL', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, page(['lost_world_map'])));

    await getAllNpcItems({ code: 'lost_world_map' });
    await getAllNpcItems({ code: 'lost_world_map' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keys the cache on params so different queries fetch separately', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, page(['a'])));

    await getAllNpcItems({ code: 'lost_world_map' });
    await getAllNpcItems({ code: 'perfect_pearl' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('caches getNpcItems responses per NPC code', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, page(['sword'])));

    await getNpcItems('weaponsmith', {});
    await getNpcItems('weaponsmith', {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache errors', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, page(['sword'])));

    const first = await getNpcItems('weaponsmith', {});
    const second = await getNpcItems('weaponsmith', {});

    expect(first).toBeInstanceOf(ApiError);
    expect(second).toEqual(page(['sword']));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
