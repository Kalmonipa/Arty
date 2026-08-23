import { jest } from '@jest/globals';

jest.mock('../../src/db.js', () => ({ db: { query: jest.fn() } }));

import { db } from '../../src/db.js';
import { logger } from '../../src/utils.js';
import { checkEnlistments } from '../../src/fightBosses/bossFightParticipantFunctions.js';

const mockedQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('checkEnlistments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the fight the character is enlisted for and its role', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ fight_id: 7, role: 'healer' }],
    } as never);

    await expect(checkEnlistments('LongLegLarry')).resolves.toEqual({
      fightId: 7,
      role: 'healer',
    });
  });

  it('reports no enlistment without logging an error', async () => {
    mockedQuery.mockResolvedValue({ rows: [] } as never);

    // The overwhelmingly common case: every job of every character checks this,
    // so treating "not enlisted" as a failure would bury real errors in the log
    await expect(checkEnlistments('LongLegLarry')).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('takes a single enlistment when the query returns several', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        { fight_id: 3, role: 'tank' },
        { fight_id: 9, role: 'dps' },
      ],
    } as never);

    await expect(checkEnlistments('LongLegLarry')).resolves.toEqual({
      fightId: 3,
      role: 'tank',
    });
  });

  it('reports no enlistment when the query fails', async () => {
    mockedQuery.mockRejectedValue(new Error('connection refused') as never);

    await expect(checkEnlistments('LongLegLarry')).resolves.toBeUndefined();
  });

  it('looks the character up by name', async () => {
    mockedQuery.mockResolvedValue({ rows: [] } as never);

    await checkEnlistments('LongLegLarry');

    expect(mockedQuery.mock.calls[0][1]).toEqual(['LongLegLarry']);
  });
});
