import { jest } from '@jest/globals';

jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return { ...actual, sleep: jest.fn(async () => {}) };
});

jest.mock('../../src/fightBosses/bossfightPreRequisite.js', () => ({
  simulateBossFight: jest.fn(),
}));

jest.mock('../../src/fightBosses/bossFight.utils.js', () => ({
  registerBossFight: jest.fn(async () => 14),
  incrementBossFightCounter: jest.fn(),
  markBossFightComplete: jest.fn(async () => true),
  markBossFightAborted: jest.fn(async () => true),
}));

jest.mock('../../src/fightBosses/bossFightParticipantFunctions.js', () => ({
  registerBossFightParticipant: jest.fn(async () => true),
  checkAllParticipantsReady: jest.fn(async () => true),
  setParticipantsState: jest.fn(async () => true),
}));

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionFight: jest.fn(),
}));

jest.mock('../../src/evaluateGear/evaluateGear.objective.js', () => ({
  EvaluateGearObjective: jest.fn(),
}));

import { actionFight } from '../../src/api_calls/Actions.js';
import { ApiError } from '../../src/core/Error.js';
import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import {
  incrementBossFightCounter,
  markBossFightAborted,
  markBossFightComplete,
} from '../../src/fightBosses/bossFight.utils.js';
import { registerBossFightParticipant } from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { FightBossLeaderObjective } from '../../src/fightBosses/bossFightLeader.objective.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';

const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;
const mockedFight = actionFight as jest.MockedFunction<typeof actionFight>;
const mockedIncrement = incrementBossFightCounter as jest.MockedFunction<
  typeof incrementBossFightCounter
>;
const mockedAbort = markBossFightAborted as jest.MockedFunction<
  typeof markBossFightAborted
>;
const mockedComplete = markBossFightComplete as jest.MockedFunction<
  typeof markBossFightComplete
>;
const mockedRegisterParticipant =
  registerBossFightParticipant as jest.MockedFunction<
    typeof registerBossFightParticipant
  >;

function buildCharacter() {
  return {
    data: { name: 'LongLegLarry' },
    jobList: [],
    executeJobNow: jest.fn(async () => ObjectiveCompleted),
    findMaps: jest.fn(() => [{ x: 9, y: 8 }]),
    evaluateClosestMap: jest.fn((maps: { x: number; y: number }[]) => maps[0]),
    move: jest.fn(async () => undefined),
  } as never;
}

function buildObjective() {
  return new FightBossLeaderObjective(buildCharacter(), {
    code: 'lich',
    quantity: 10,
  });
}

describe('FightBossLeaderObjective abandoning a registered fight', () => {
  beforeEach(() => {
    // clearAllMocks drops the recorded calls but keeps implementations, so the
    // happy-path defaults are restored here rather than leaking between tests
    jest.clearAllMocks();
    mockedRegisterParticipant.mockResolvedValue(true);
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 95,
      averageTurns: 14,
      loadouts: [],
    });
  });

  // The regression: fight 4 of 10 came back 598 "Monster not found on this
  // map", the leader returned failed, and the row was left in_progress with
  // two participants still standing at the tomb waiting to be called
  it('marks the fight aborted when the fight action errors', async () => {
    mockedFight.mockResolvedValue(
      new ApiError({ code: 598, message: 'Monster not found on this map.' }),
    );

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedAbort).toHaveBeenCalledWith(14);
  });

  it('marks the fight aborted when gearing up fails', async () => {
    const character = buildCharacter() as unknown as {
      executeJobNow: jest.Mock;
    };
    character.executeJobNow = jest.fn(async () => ({
      success: false,
      status: 'failed',
    })) as jest.Mock;

    const objective = new FightBossLeaderObjective(character as never, {
      code: 'lich',
      quantity: 10,
    });

    const result = await objective.run();

    expect(result.success).toBe(false);
    expect(mockedAbort).toHaveBeenCalledWith(14);
  });

  it('marks the fight aborted when a participant cannot be registered', async () => {
    mockedRegisterParticipant.mockResolvedValue(false);

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedAbort).toHaveBeenCalledWith(14);
  });

  it('marks the fight aborted when the run throws', async () => {
    mockedFight.mockRejectedValue(new Error('socket hang up'));

    await expect(buildObjective().run()).rejects.toThrow('socket hang up');
    expect(mockedAbort).toHaveBeenCalledWith(14);
  });

  it('completes rather than aborts when every fight is won', async () => {
    mockedFight.mockResolvedValue({} as never);
    mockedIncrement.mockResolvedValue(10);

    const result = await buildObjective().run();

    expect(result.success).toBe(true);
    expect(mockedComplete).toHaveBeenCalledWith(14);
    expect(mockedAbort).not.toHaveBeenCalled();
  });

  it('does not abort a fight it never registered', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      success: false,
      winRate: 40,
      averageTurns: 26,
      loadouts: [],
    });

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedAbort).not.toHaveBeenCalled();
  });
});
