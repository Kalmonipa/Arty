import { jest } from '@jest/globals';
import { actionUse } from '../../src/api_calls/Items.js';
import { actionFight } from '../../src/api_calls/Actions.js';
import { requestLoadout } from '../../src/api_calls/Account.js';
import { ApiError } from '../../src/core/Error.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

describe('api_calls error handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('actionUse', () => {
    it('returns an ApiError when fetch throws a transient network error', async () => {
      // Simulate a network blip: fetch rejects with a plain TypeError
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new TypeError('fetch failed'));

      const result = await actionUse(mockCharacterData, {
        code: 'fish_soup',
        quantity: 1,
      });

      // The caller relies on `instanceof ApiError` to route errors safely.
      // A raw TypeError defeats that guard and crashes the process.
      expect(result).toBeInstanceOf(ApiError);
    });

    it('returns an ApiError when the response body cannot be parsed', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      const result = await actionUse(mockCharacterData, {
        code: 'fish_soup',
        quantity: 1,
      });

      expect(result).toBeInstanceOf(ApiError);
    });
  });

  describe('actionFight', () => {
    it('returns an ApiError when fetch throws a transient network error', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new TypeError('fetch failed'));

      const result = await actionFight(mockCharacterData, []);

      expect(result).toBeInstanceOf(ApiError);
    });
  });

  describe('requestLoadout', () => {
    it('returns an ApiError when the request never leaves the process', async () => {
      // A raw TypeError here passes the caller's `instanceof ApiError` guard,
      // so a failed request reads as a success and yields an undefined loadout.
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(
          new TypeError('Request with GET/HEAD method cannot have body.'),
        );

      const result = await requestLoadout('BouncyBella', 'king_slime');

      expect(result).toBeInstanceOf(ApiError);
    });

    it('returns an ApiError when the participant responds non-OK', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error.' }),
      } as unknown as Response);

      const result = await requestLoadout('BouncyBella', 'king_slime');

      expect(result).toBeInstanceOf(ApiError);
    });
  });
});
