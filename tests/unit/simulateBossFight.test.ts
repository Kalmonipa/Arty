import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Monsters', () => ({
  getMonsterInformation: jest.fn(),
}));

jest.mock('../../src/character/character.apiCalls.ts', () => ({
  getMyCharacters: jest.fn(),
}));

jest.mock('../../src/api_calls/Account', () => ({
  requestLoadout: jest.fn(),
}));

import { getMonsterInformation } from '../../src/api_calls/Monsters.js';
import { getMyCharacters } from '../../src/character/character.apiCalls.js';
import { requestLoadout } from '../../src/api_calls/Account.js';
import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import { FightSimulator } from '../../src/fights/fight.simulator.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';
import { ApiError } from '../../src/core/Error.js';

const mockedMonster = getMonsterInformation as jest.MockedFunction<
  typeof getMonsterInformation
>;
const mockedCharacters = getMyCharacters as jest.MockedFunction<
  typeof getMyCharacters
>;
const mockedLoadout = requestLoadout as jest.MockedFunction<
  typeof requestLoadout
>;

const loadoutFor = (name: string, weapon: string) =>
  ({
    level: 35,
    weapon_slot: weapon,
    helmet_slot: `${name}_helm`,
  }) as never;

/**
 * Stands in for the character running the sim. executeJobNow is where the real
 * Character hands the job its turn, so the fake stamps the numbers the game's
 * sim would have written onto the job instance.
 */
class FakeLeader {
  data = { name: 'LongLegLarry', level: 39 };
  currentExecutingJob = undefined;
  simOutcome = { winRate: 0, averageTurns: 0, result: ObjectiveFailed };

  createFakeCharacterSchema = jest.fn((charData: { name?: string }) => ({
    level: 39,
    weapon_slot: 'greater_dreadful_staff',
    helmet_slot: `${charData?.name ?? 'unknown'}_helm`,
  }));

  handleErrors = jest.fn(async () => true);

  executeJobNow = jest.fn(async (job: FightSimulator) => {
    job.winRate = this.simOutcome.winRate;
    job.averageTurns = this.simOutcome.averageTurns;
    return this.simOutcome.result;
  });
}

let leader: FakeLeader;

beforeEach(() => {
  jest.clearAllMocks();

  leader = new FakeLeader();

  mockedMonster.mockResolvedValue({
    data: { code: 'lich', name: 'Lich' },
  } as never);

  mockedCharacters.mockResolvedValue([
    { name: 'BouncyBella', level: 35 },
    { name: 'JumpyJimmy', level: 36 },
  ] as never);

  mockedLoadout.mockImplementation(async (charName: string) => ({
    message: 'ok',
    character: charName,
    proposedLoadout: loadoutFor(charName, 'gold_sword'),
  }));
});

describe('simulateBossFight', () => {
  it('reports the win rate and average turns the sim produced', async () => {
    leader.simOutcome = {
      winRate: 40,
      averageTurns: 26,
      result: ObjectiveFailed,
    };

    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(result.winRate).toBe(40);
    expect(result.averageTurns).toBe(26);
  });

  it('reports the loadouts it simulated, leader first', async () => {
    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(result.loadouts.map((loadout) => loadout.helmet_slot)).toEqual([
      'LongLegLarry_helm',
      'BouncyBella_helm',
      'JumpyJimmy_helm',
    ]);
  });

  it('still carries the win or loss verdict', async () => {
    leader.simOutcome = {
      winRate: 100,
      averageTurns: 12,
      result: ObjectiveCompleted,
    };

    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(result.success).toBe(true);
  });

  it('reports zeroed stats when the monster cannot be looked up', async () => {
    mockedMonster.mockResolvedValue(
      new ApiError({ code: 404, message: 'not found' }) as never,
    );

    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.winRate).toBe(0);
    expect(result.loadouts).toEqual([]);
  });

  it('runs the sim for the requested number of iterations', async () => {
    await simulateBossFight(leader as never, { code: 'lich', quantity: 10 });

    const job = leader.executeJobNow.mock.calls[0][0] as FightSimulator;
    expect(job.iterations).toBe(10);
    expect(job.targetMobCode).toBe('lich');
  });
});
