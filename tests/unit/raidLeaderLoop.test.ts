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
  registerBossFight: jest.fn(async () => 21),
  incrementBossFightCounter: jest.fn(async () => 1),
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

jest.mock('../../src/api_calls/Raids.js', () => ({
  findRaid: jest.fn(),
}));

jest.mock('../../src/evaluateGear/evaluateGear.objective.js', () => ({
  EvaluateGearObjective: jest.fn(),
}));

import { actionFight } from '../../src/api_calls/Actions.js';
import { findRaid } from '../../src/api_calls/Raids.js';
import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import {
  markBossFightAborted,
  markBossFightComplete,
} from '../../src/fightBosses/bossFight.utils.js';
import { registerBossFightParticipant } from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { EvaluateGearObjective } from '../../src/evaluateGear/evaluateGear.objective.js';
import { RaidLeaderObjective } from '../../src/fightRaids/raidLeader.objective.js';
import {
  RaidFightAttempts,
  RaidLossLimit,
  RaidRoster,
  RaidTransientErrorCodes,
  RaidWinRateThreshold,
} from '../../src/fightRaids/raid.utils.js';
import { ApiError } from '../../src/core/Error.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';

const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;
const mockedFight = actionFight as jest.MockedFunction<typeof actionFight>;
const mockedFindRaid = findRaid as jest.MockedFunction<typeof findRaid>;
const mockedComplete = markBossFightComplete as jest.MockedFunction<
  typeof markBossFightComplete
>;
const mockedAbort = markBossFightAborted as jest.MockedFunction<
  typeof markBossFightAborted
>;
const mockedGearUp = EvaluateGearObjective as unknown as jest.Mock;
const mockedRegisterParticipant =
  registerBossFightParticipant as jest.MockedFunction<
    typeof registerBossFightParticipant
  >;

/** The raid is named one thing; the monster the party fights is named another */
const raidWith = (status: string) =>
  ({ code: 'enchanted_fairy', monster: 'pixie', status }) as never;

const running = () => raidWith('active');

/**
 * The raid stays open for `fights` fights and is over by the next check. One
 * extra for the check run() makes before it bothers simulating anything.
 */
function raidOpenFor(fights: number, ending = 'finished_success') {
  let checks = 0;
  mockedFindRaid.mockImplementation(async () => {
    checks += 1;
    return checks <= fights + 1 ? running() : raidWith(ending);
  });
}

/**
 * A raid fight is won by surviving all 100 turns; a loss means the party died
 * and put nothing on the shared pool.
 */
const fought = (result: 'win' | 'loss') =>
  ({
    data: { fight: { result, turns: result === 'win' ? 100 : 41 } },
  }) as never;

let character: {
  findMaps: jest.Mock;
  executeJobNow: jest.Mock;
  move: jest.Mock;
};

function buildObjective() {
  character = {
    data: { name: 'LongLegLarry' },
    jobList: [],
    executeJobNow: jest.fn(async () => ObjectiveCompleted),
    findMaps: jest.fn(() => [{ map_id: 91, x: -4, y: 10 }]),
    evaluateClosestMap: jest.fn((maps: unknown[]) => maps[0]),
    move: jest.fn(async () => undefined),
  } as never;

  return new RaidLeaderObjective(character as never, {
    code: 'enchanted_fairy',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedRegisterParticipant.mockResolvedValue(true);
  mockedSimulate.mockResolvedValue({
    ...ObjectiveCompleted,
    winRate: 60,
    averageTurns: 100,
    loadouts: [],
  });
  mockedFindRaid.mockResolvedValue(running());
  mockedFight.mockResolvedValue(fought('loss'));
});

describe('RaidLeaderObjective mustering the party', () => {
  // The leader takes the threat lead and the boss commits to it, so the other
  // two never need to survive a hit — their turns are worth more spent healing.
  // Three equal tanks split the boss's attacks three ways and each then needs
  // its own restores, which simulated far worse than one tank and two healers.
  it('registers the other two as healers, leaving the leader to tank', async () => {
    await buildObjective().run();

    expect(
      mockedRegisterParticipant.mock.calls.map(
        ([params]) => params.participant.role,
      ),
    ).toEqual(['healer', 'healer']);
  });

  it('registers them against the raid rather than a boss fight', async () => {
    await buildObjective().run();

    expect(mockedRegisterParticipant.mock.calls[0][0].isRaid).toBe(true);
  });

  it('simulates the monster, with the raid party and the raid win bar', async () => {
    await buildObjective().run();

    const [, target, options] = mockedSimulate.mock.calls[0];

    // pixie is what gets fought; enchanted_fairy is only the raid's name
    expect(target.code).toBe('pixie');
    expect(options?.roster).toBe(RaidRoster);
    expect(options?.leaderRole).toBe('tank');
    expect(options?.winRateThreshold).toBe(RaidWinRateThreshold);
  });

  it('gears up against the monster, not the raid', async () => {
    mockedFight.mockResolvedValue(fought('win'));
    raidOpenFor(1);

    await buildObjective().run();

    expect(mockedGearUp.mock.calls[0][0]).toMatchObject({
      targetMob: 'pixie',
      bossFightRole: 'tank',
    });
  });

  // The sim already paid to find out which allocation works. Re-deciding at
  // gear-up time would throw that answer away and equip whatever the plan
  // happens to list first.
  it('gears up for the variant the sim settled on', async () => {
    mockedFight.mockResolvedValue(fought('win'));
    raidOpenFor(1);
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 100,
      averageTurns: 100,
      loadouts: [],
      variant: 'bulk',
    });

    await buildObjective().run();

    expect(mockedGearUp.mock.calls[0][0]).toMatchObject({
      gearVariant: 'bulk',
    });
  });

  it('walks to the raid map, which is keyed by the raid code', async () => {
    mockedFight.mockResolvedValue(fought('win'));
    raidOpenFor(1);

    await buildObjective().run();

    expect(character.findMaps).toHaveBeenCalledWith({
      content_code: 'enchanted_fairy',
    });
    expect(character.move).toHaveBeenCalled();
  });

  it('never musters for a raid the sim says it cannot survive', async () => {
    mockedSimulate.mockResolvedValue({
      success: false,
      complete: true,
      reason: 'complete',
      winRate: 20,
      averageTurns: 44,
      loadouts: [],
    } as never);

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedRegisterParticipant).not.toHaveBeenCalled();
    expect(mockedFight).not.toHaveBeenCalled();
  });
});

describe('RaidLeaderObjective ending the raid', () => {
  it('gives up after three fights lost in a row', async () => {
    mockedFight.mockResolvedValue(fought('loss'));

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(RaidLossLimit);
    expect(result.success).toBe(false);
    expect(mockedAbort).toHaveBeenCalledWith(21);
  });

  it('lets a win clear the losing streak', async () => {
    mockedFight
      .mockResolvedValueOnce(fought('loss'))
      .mockResolvedValueOnce(fought('loss'))
      .mockResolvedValueOnce(fought('win'))
      .mockResolvedValue(fought('loss'));

    await buildObjective().run();

    // Two losses, a win that resets the count, then three more to stop on
    expect(mockedFight).toHaveBeenCalledTimes(6);
  });

  it('stops once the boss is dead', async () => {
    mockedFight.mockResolvedValue(fought('win'));
    raidOpenFor(2);

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(mockedComplete).toHaveBeenCalledWith(21);
  });

  it('stops when the window closes mid-raid', async () => {
    mockedFight.mockResolvedValue(fought('win'));
    raidOpenFor(1, 'finished_failure');

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(mockedComplete).toHaveBeenCalledWith(21);
  });

  it('never starts on a raid that is not open yet', async () => {
    mockedFindRaid.mockResolvedValue(raidWith('upcoming'));

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedFight).not.toHaveBeenCalled();
  });

  it('stands down rather than guessing when the raid cannot be read', async () => {
    mockedFindRaid.mockResolvedValue(undefined);

    const result = await buildObjective().run();

    expect(result.success).toBe(false);
    expect(mockedFight).not.toHaveBeenCalled();
  });
});

describe('RaidLeaderObjective riding out a transient API error', () => {
  // A single 486 one fight into the 2026-09-12 window stood the party down and
  // wrote the raid off for the next eleven hours. Other players finished the
  // boss eight minutes later.
  const apiError = (code: number) =>
    new ApiError({ code, message: `error ${code}` }) as never;

  it('treats an action-already-in-progress as worth another go', () => {
    expect(RaidTransientErrorCodes.has(486)).toBe(true);
  });

  it('retries a transient error and fights on when it clears', async () => {
    raidOpenFor(1);
    mockedFight
      .mockResolvedValueOnce(apiError(486))
      .mockResolvedValue(fought('win'));

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
  });

  it('gives up once the retries are spent', async () => {
    mockedFight.mockResolvedValue(apiError(486));

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(RaidFightAttempts);
    expect(result.success).toBe(false);
  });

  it('leaves the raid retryable rather than written off for the window', async () => {
    mockedFight.mockResolvedValue(apiError(486));

    const objective = buildObjective();
    await objective.run();

    expect(objective.failedTransiently).toBe(true);
  });

  it('stands down at once on an error retrying cannot help', async () => {
    // 497, a full inventory, is not going to clear itself in ten seconds
    mockedFight.mockResolvedValue(apiError(497));

    const result = await buildObjective().run();

    expect(mockedFight).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it('does not call a lost fight transient', async () => {
    // Losing is a real verdict on the party's gear, not a blip
    mockedFight.mockResolvedValue(fought('loss'));

    const objective = buildObjective();
    await objective.run();

    expect(objective.failedTransiently).toBe(false);
  });

  it('does not call an unsurvivable sim transient', async () => {
    mockedSimulate.mockResolvedValue({
      complete: true,
      success: false,
      reason: 'failed',
      winRate: 0,
      averageTurns: 0,
      loadouts: [],
    });

    const objective = buildObjective();
    await objective.run();

    expect(objective.failedTransiently).toBe(false);
  });
});
