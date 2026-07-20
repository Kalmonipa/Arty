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
