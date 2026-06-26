import { jest } from '@jest/globals';
import { getAllMaps } from '../../src/api_calls/Maps.js';

// The real ArtifactsMMO /maps endpoint defaults to size=50 (29 pages for the
// full map set). getAllMaps must page through with a consistent size so no
// maps are skipped. A regression here drops whole pages of maps, which then
// have no zone and break navigation (e.g. "no zone for current map 91").
describe('getAllMaps pagination', () => {
  const TOTAL = 250;
  const DEFAULT_SIZE = 50;
  const allMapIds = Array.from({ length: TOTAL }, (_, i) => i + 1);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockPaginatedMaps() {
    jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input.toString());
      const size = Number(url.searchParams.get('size') ?? DEFAULT_SIZE);
      const page = Number(url.searchParams.get('page') ?? 1);

      const start = (page - 1) * size;
      const data = allMapIds
        .slice(start, start + size)
        .map((map_id) => ({ map_id }));

      return {
        ok: true,
        status: 200,
        json: async () => ({
          data,
          total: TOTAL,
          page,
          size,
          pages: Math.ceil(TOTAL / size),
        }),
      } as unknown as Response;
    });
  }

  it('fetches every map across all pages without gaps', async () => {
    mockPaginatedMaps();

    const maps = await getAllMaps({});
    const ids = maps.map((m) => m.map_id);

    expect(maps.length).toBe(TOTAL);
    // map 75 lives in the 50-99 range that the size mismatch used to skip.
    expect(ids).toContain(75);
    expect(new Set(ids).size).toBe(TOTAL);
  });
});
