import { jest } from '@jest/globals';

jest.mock('../../src/db.js', () => ({ db: { query: jest.fn() } }));

import { db } from '../../src/db.js';
import { getBossFightState } from '../../src/fightBosses/bossFight.utils.js';
import { isBossFightOver } from '../../src/fightBosses/bossFight.types.js';

const mockedQuery = db.query as unknown as jest.Mock<
  (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
>;

describe('reading the state of a boss fight', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports the state a live fight is in', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ state: 'in_progress' }] });

    expect(await getBossFightState(7)).toBe('in_progress');
  });

  it('treats a fight that no longer exists as over', async () => {
    // A participant restored from disk after a restart still holds the id of
    // the fight it was enlisted in. If a vanished fight doesn't read as over,
    // it gears up and polls a fight nobody is running for good — and blocks
    // itself from joining the leader's next one
    mockedQuery.mockResolvedValue({ rows: [] });

    const state = await getBossFightState(7);

    expect(isBossFightOver(state)).toBe(true);
  });

  it('does not call a fight over when the query itself failed', async () => {
    mockedQuery.mockRejectedValue(new Error('connection reset'));

    const state = await getBossFightState(7);

    expect(isBossFightOver(state)).toBe(false);
  });
});
