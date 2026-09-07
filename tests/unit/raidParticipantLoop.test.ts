import { jest } from '@jest/globals';

jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return { ...actual, sleep: jest.fn(async () => {}) };
});

jest.mock('../../src/fightBosses/bossFight.utils.js', () => ({
  getBossFightState: jest.fn(async () => 'in_progress'),
  getCurrentNumFights: jest.fn(async () => 0),
}));

jest.mock('../../src/fightBosses/bossFightParticipantFunctions.js', () => ({
  acceptBossFightCompletion: jest.fn(async () => true),
  setParticipantsState: jest.fn(async () => true),
}));

jest.mock('../../src/api_calls/Raids.js', () => ({
  findRaid: jest.fn(),
}));

jest.mock('../../src/evaluateGear/evaluateGear.objective.js', () => ({
  EvaluateGearObjective: jest.fn(),
}));

import { findRaid } from '../../src/api_calls/Raids.js';
import { EvaluateGearObjective } from '../../src/evaluateGear/evaluateGear.objective.js';
import {
  getBossFightState,
  getCurrentNumFights,
} from '../../src/fightBosses/bossFight.utils.js';
import {
  acceptBossFightCompletion,
  setParticipantsState,
} from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { RaidParticipantObjective } from '../../src/fightRaids/raidParticipant.objective.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';

const mockedFindRaid = findRaid as jest.MockedFunction<typeof findRaid>;
const mockedGearUp = EvaluateGearObjective as unknown as jest.Mock;
const mockedState = getBossFightState as jest.MockedFunction<
  typeof getBossFightState
>;
const mockedNumFights = getCurrentNumFights as jest.MockedFunction<
  typeof getCurrentNumFights
>;
const mockedReady = setParticipantsState as jest.MockedFunction<
  typeof setParticipantsState
>;
const mockedAck = acceptBossFightCompletion as jest.MockedFunction<
  typeof acceptBossFightCompletion
>;

const raid = { code: 'enchanted_fairy', monster: 'pixie', status: 'active' };

let character: { findMaps: jest.Mock; move: jest.Mock };

function buildObjective() {
  character = {
    data: { name: 'BouncyBella' },
    jobList: [],
    executeJobNow: jest.fn(async () => ObjectiveCompleted),
    findMaps: jest.fn(() => [{ map_id: 91, x: -4, y: 10 }]),
    evaluateClosestMap: jest.fn((maps: unknown[]) => maps[0]),
    move: jest.fn(async () => undefined),
  } as never;

  return new RaidParticipantObjective(
    character as never,
    { code: 'enchanted_fairy' },
    'tank',
    21,
  );
}

/**
 * The leader calls a fight by bumping fights_done, then ends the raid by
 * setting the state. This plays out `fights` rounds and then the ending.
 */
function leaderRuns(fights: number, ending = 'complete') {
  let called = 0;
  mockedNumFights.mockImplementation(async () => called);
  mockedState.mockImplementation(async () => {
    if (called >= fights) return ending as never;
    return 'in_progress' as never;
  });
  mockedReady.mockImplementation(async () => {
    // Standing ready is what the leader waits on, so the fight lands next
    called += 1;
    return true;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFindRaid.mockResolvedValue(raid as never);
  leaderRuns(1);
});

describe('RaidParticipantObjective preparing for each fight', () => {
  it('gears up against the monster rather than the raid', async () => {
    await buildObjective().run();

    expect(mockedGearUp.mock.calls[0][0]).toMatchObject({
      targetMob: 'pixie',
      bossFightRole: 'tank',
    });
  });

  it('walks to the raid map, which is keyed by the raid code', async () => {
    await buildObjective().run();

    expect(character.findMaps).toHaveBeenCalledWith({
      content_code: 'enchanted_fairy',
    });
    expect(character.move).toHaveBeenCalled();
  });

  it('reports ready once it is standing on the map', async () => {
    await buildObjective().run();

    expect(mockedReady).toHaveBeenCalledWith(21, 'BouncyBella', 'ready');
  });

  it('prepares again for every fight the leader calls', async () => {
    leaderRuns(3);

    await buildObjective().run();

    expect(mockedGearUp).toHaveBeenCalledTimes(3);
  });
});

describe('RaidParticipantObjective standing down', () => {
  it('keeps going until the leader ends the raid, with no count of its own', async () => {
    // A raid has no target quantity: the leader decides when it is over
    leaderRuns(5);

    const result = await buildObjective().run();

    expect(mockedGearUp).toHaveBeenCalledTimes(5);
    expect(result.success).toBe(true);
  });

  it('acknowledges a raid the leader completed', async () => {
    leaderRuns(1);

    const result = await buildObjective().run();

    expect(mockedAck).toHaveBeenCalledWith(21, 'BouncyBella');
    expect(result.success).toBe(true);
  });

  it('acknowledges a raid the leader abandoned', async () => {
    leaderRuns(1, 'aborted');

    const result = await buildObjective().run();

    expect(mockedAck).toHaveBeenCalledWith(21, 'BouncyBella');
    expect(result.success).toBe(true);
  });

  it('stands down without gearing up when the raid is already over', async () => {
    mockedState.mockResolvedValue('complete' as never);

    await buildObjective().run();

    expect(mockedGearUp).not.toHaveBeenCalled();
    expect(mockedAck).toHaveBeenCalledWith(21, 'BouncyBella');
  });

  it('gives up when the raid cannot be read', async () => {
    mockedFindRaid.mockResolvedValue(undefined);

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedGearUp).not.toHaveBeenCalled();
  });
});
