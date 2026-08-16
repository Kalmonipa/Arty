import { jest } from '@jest/globals';

jest.mock('../../src/fightBosses/bossfightPreRequisite', () => ({
  simulateBossFight: jest.fn(),
}));

import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import { FightBossLeaderObjective } from '../../src/fightBosses/fightBossLeaderObjective.js';
import { ObjectiveFailed } from '../../src/types/ObjectiveData.js';
import { logger } from '../../src/utils.js';

const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;

const character = {
  data: { name: 'LongLegLarry' },
  jobList: [],
} as never;

describe('FightBossLeaderObjective refusing an unwinnable fight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('says how close the party came rather than just refusing', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveFailed,
      winRate: 40,
      averageTurns: 26,
      loadouts: [],
    });

    const objective = new FightBossLeaderObjective(character, {
      code: 'lich',
      quantity: 10,
    });

    const result = await objective.run();

    expect(result.success).toBe(false);
    const warnings = (logger.warn as jest.Mock).mock.calls.map(
      ([message]) => message as string,
    );
    expect(warnings.some((message) => message.includes('40%'))).toBe(true);
  });
});
