import { classifyRequest } from '../../src/api_calls/rateLimitBuckets.js';

const api = 'https://api.artifactsmmo.com';

describe('classifyRequest', () => {
  describe('bucket', () => {
    it.each([
      ['POST', `${api}/my/LongLegLarry/action/fight`, 'action'],
      ['POST', `${api}/my/LongLegLarry/action/bank/deposit/item`, 'action'],
      ['POST', `${api}/simulation/fight`, 'simulation'],
      ['GET', `${api}/my/rates`, 'account'],
      ['POST', `${api}/my/change_password`, 'account'],
      ['POST', `${api}/my/buy_gems`, 'account'],
      ['POST', `${api}/characters/create`, 'account'],
      ['POST', `${api}/token`, 'account'],
      ['GET', `${api}/my/bank/items`, 'data'],
      ['GET', `${api}/my/bank`, 'data'],
      ['GET', `${api}/characters/LongLegLarry`, 'data'],
      ['GET', `${api}/items`, 'data'],
      ['GET', `${api}/events/active`, 'data'],
      ['GET', `${api}/maps`, 'data'],
    ])('puts %s %s in the %s bucket', (method, url, bucket) => {
      expect(classifyRequest(url, method).bucket).toBe(bucket);
    });

    // /characters/{name} is a data read but /characters/create is an account
    // write, so the path alone is not enough to tell them apart.
    it('separates a character read from a character create', () => {
      expect(classifyRequest(`${api}/characters/create`, 'POST').bucket).toBe(
        'account',
      );
      expect(classifyRequest(`${api}/characters/create`, 'GET').bucket).toBe(
        'data',
      );
    });
  });

  describe('endpoint label', () => {
    it('collapses the character name so one label covers the fleet', () => {
      expect(
        classifyRequest(`${api}/my/ZippyZoe/action/move`, 'POST').endpoint,
      ).toBe('/my/{name}/action/move');
    });

    it('collapses item codes so the label cannot explode in cardinality', () => {
      expect(classifyRequest(`${api}/items/copper_ore`, 'GET').endpoint).toBe(
        '/items/{code}',
      );
      expect(classifyRequest(`${api}/monsters/chicken`, 'GET').endpoint).toBe(
        '/monsters/{code}',
      );
    });

    it('drops the query string, which is where item codes hide', () => {
      expect(
        classifyRequest(`${api}/my/bank/items?item_code=nettle_leaf`, 'GET')
          .endpoint,
      ).toBe('/my/bank/items');
    });

    it('keeps a collection path as-is', () => {
      expect(classifyRequest(`${api}/my/bank/items`, 'GET').endpoint).toBe(
        '/my/bank/items',
      );
    });

    it('accepts a URL object as well as a string', () => {
      const url = new URL(`${api}/my/bank/items`);
      url.searchParams.set('size', '100');

      expect(classifyRequest(url, 'GET').endpoint).toBe('/my/bank/items');
    });
  });
});
