import { jest } from '@jest/globals';

jest.mock('../../src/fightBosses/bossfightPreRequisite', () => ({
  simulateBossFight: jest.fn(),
}));

jest.mock('../../src/fightBosses/bossFight.utils.js', () => ({
  registerBossFight: jest.fn(async () => 42),
  incrementBossFightCounter: jest.fn(async () => 1),
  markBossFightAborted: jest.fn(async () => true),
  setBossFightState: jest.fn(async () => true),
  cleanUpBossFight: jest.fn(async () => true),
  getBossFightState: jest.fn(async () => 'in_progress'),
  getCurrentNumFights: jest.fn(async () => 0),
  getBossFightTarget: jest.fn(async () => undefined),
}));

jest.mock('../../src/fightBosses/bossFightParticipantFunctions.js', () => ({
  registerBossFightParticipant: jest.fn(async () => true),
  checkAllParticipantsReady: jest.fn(async () => true),
  setParticipantsState: jest.fn(async () => true),
  acceptBossFightCompletion: jest.fn(async () => true),
  checkEnlistments: jest.fn(async () => undefined),
}));

import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import { registerBossFightParticipant } from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { FightBossLeaderObjective } from '../../src/fightBosses/bossFightLeader.objective.js';
import { EvaluateGearObjective } from '../../src/evaluateGear/evaluateGear.objective.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';

const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;

describe('FightBossLeaderObjective role assignment', () => {
  let executedJobs: EvaluateGearObjective[];
  let character: never;

  beforeEach(() => {
    jest.clearAllMocks();
    executedJobs = [];

    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 100,
      averageTurns: 12,
      loadouts: [],
    });

    character = {
      data: { name: 'LongLegLarry' },
      jobList: [],
      // Failing the gear up job stops the fight loop after the one thing this
      // test cares about: how the leader asked to be geared
      executeJobNow: jest.fn(async (job: EvaluateGearObjective) => {
        executedJobs.push(job);
        return ObjectiveFailed;
      }),
    } as never;
  });

  it('gears the leader up as the tank', async () => {
    const objective = new FightBossLeaderObjective(character, {
      code: 'lich',
      quantity: 1,
    });

    await objective.run();

    expect(executedJobs).toHaveLength(1);
    expect(executedJobs[0]).toBeInstanceOf(EvaluateGearObjective);
    expect(executedJobs[0].bossFightRole).toBe('tank');
    expect(executedJobs[0].targetMob).toBe('lich');
  });

  it('registers the other two characters as dps and healer', async () => {
    const objective = new FightBossLeaderObjective(character, {
      code: 'lich',
      quantity: 1,
    });

    await objective.run();

    const registered = (
      registerBossFightParticipant as jest.Mock
    ).mock.calls.map(([, participant]) => participant);

    expect(registered).toEqual([
      { characterName: 'BouncyBella', role: 'dps' },
      { characterName: 'JumpyJimmy', role: 'healer' },
    ]);
  });
});
