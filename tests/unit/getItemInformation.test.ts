import { jest } from '@jest/globals';
import {
  clearItemCache,
  getAllItemInformation,
  getItemInformation,
} from '../../src/api_calls/Items.js';
import { ApiError } from '../../src/core/Error.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const item = (code: string) => ({ code, name: code, type: 'resource' });

describe('getItemInformation caching', () => {
  beforeEach(() => clearItemCache());
  afterEach(() => jest.restoreAllMocks());

  it('fetches on a cold cache and serves the second call from memory', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(jsonResponse(200, { data: item('adamantite_ore') }));

    const first = await getItemInformation('adamantite_ore');
    const second = await getItemInformation('adamantite_ore');

    expect(first).toEqual(item('adamantite_ore'));
    expect(second).toEqual(item('adamantite_ore'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('is warmed in bulk by getAllItemInformation so single lookups make no call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        data: [item('adamantite_ore'), item('copper_ore')],
        total: 2,
        page: 1,
        size: 100,
        pages: 1,
      }),
    );

    await getAllItemInformation({ size: 100 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const result = await getItemInformation('copper_ore');

    expect(result).toEqual(item('copper_ore'));
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no extra fetch for the lookup
  });

  it('does not cache errors, so a later call retries the request', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(404, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: item('flying_wing') }));

    const first = await getItemInformation('flying_wing');
    const second = await getItemInformation('flying_wing');

    expect(first).toBeInstanceOf(ApiError);
    expect(second).toEqual(item('flying_wing'));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
