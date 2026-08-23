import { jest } from '@jest/globals';

// The wait loop sleeps between polls. Left real, a participant that never
// notices the abort would hang the run, so the fake sleep gives up after a
// handful of turns and reports the spin instead
const MAX_SLEEPS = 5;
let sleepCount = 0;

jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return {
    ...actual,
    sleep: jest.fn(async () => {
      sleepCount += 1;
      if (sleepCount > MAX_SLEEPS) {
        throw new Error('participant span the wait loop without re-checking');
      }
    }),
  };
});

jest.mock('../../src/fightBosses/bossFight.utils.js', () => ({
  getBossFightState: jest.fn(),
  getCurrentNumFights: jest.fn(),
}));

jest.mock('../../src/fightBosses/bossFightParticipantFunctions.js', () => ({
  acceptBossFightCompletion: jest.fn(async () => true),
  setParticipantsState: jest.fn(async () => true),
}));

jest.mock('../../src/evaluateGear/evaluateGear.objective.js', () => ({
  EvaluateGearObjective: jest.fn(),
}));

import {
  getBossFightState,
  getCurrentNumFights,
} from '../../src/fightBosses/bossFight.utils.js';
import { acceptBossFightCompletion } from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { FightBossParticipantObjective } from '../../src/fightBosses/bossFightParticipant.objective.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';

const mockedState = getBossFightState as jest.MockedFunction<
  typeof getBossFightState
>;
const mockedNumFights = getCurrentNumFights as jest.MockedFunction<
  typeof getCurrentNumFights
>;
const mockedAccept = acceptBossFightCompletion as jest.MockedFunction<
  typeof acceptBossFightCompletion
>;

function buildCharacter() {
  return {
    data: { name: 'JumpyJimmy' },
    jobList: [],
    executeJobNow: jest.fn(async () => ObjectiveCompleted),
    findMaps: jest.fn(() => [{ x: 9, y: 8 }]),
    evaluateClosestMap: jest.fn((maps: { x: number; y: number }[]) => maps[0]),
    move: jest.fn(async () => undefined),
  } as never;
}

describe('FightBossParticipantObjective when the leader abandons the fight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sleepCount = 0;
  });

  // The regression: the leader hit an API error on fight 4 of 10 and returned
  // failed, so fights_done stopped at 3. The participants were waiting on that
  // counter alone and never looked at the fight state again
  it('leaves the wait loop when the fight is aborted without the counter moving', async () => {
    mockedState
      .mockResolvedValueOnce('in_progress')
      .mockResolvedValue('aborted');
    mockedNumFights.mockResolvedValue(3);

    const objective = new FightBossParticipantObjective(
      buildCharacter(),
      { code: 'lich', quantity: 10 },
      'healer',
      14,
    );

    await expect(objective.run()).resolves.toEqual(ObjectiveCompleted);
    expect(mockedAccept).toHaveBeenCalledWith(14, 'JumpyJimmy');
  });

  it('leaves the wait loop when the fight completes without the counter moving', async () => {
    mockedState
      .mockResolvedValueOnce('in_progress')
      .mockResolvedValue('complete');
    mockedNumFights.mockResolvedValue(3);

    const objective = new FightBossParticipantObjective(
      buildCharacter(),
      { code: 'lich', quantity: 10 },
      'dps',
      14,
    );

    await expect(objective.run()).resolves.toEqual(ObjectiveCompleted);
    expect(mockedAccept).toHaveBeenCalledWith(14, 'JumpyJimmy');
  });

  it('keeps waiting while the fight is still in progress', async () => {
    mockedState.mockResolvedValue('in_progress');
    // The counter advances on the third poll, as it would when the leader wins
    // a round, and the participant goes back round to prepare again
    mockedNumFights
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3)
      .mockResolvedValue(10);

    const objective = new FightBossParticipantObjective(
      buildCharacter(),
      { code: 'lich', quantity: 10 },
      'healer',
      14,
    );

    await expect(objective.run()).resolves.toEqual(ObjectiveCompleted);
    // Still in progress, so there was nothing to acknowledge
    expect(mockedAccept).not.toHaveBeenCalled();
  });
});
