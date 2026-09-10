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
import {
  RaidLeaderRole,
  RaidRoster,
  RaidWinRateThreshold,
} from '../../src/fightRaids/raid.utils.js';

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

  // The leader proposes its own loadout rather than simulating what it happens
  // to be wearing, since this runs before anybody gears up
  proposedLoadout: Record<string, unknown> = {
    level: 39,
    weapon_slot: 'greater_dreadful_staff',
    helmet_slot: 'LongLegLarry_helm',
    utility1_slot: 'greater_health_potion',
    utility1_slot_quantity: 100,
    utility2_slot: 'fire_res_potion',
    utility2_slot_quantity: 60,
  };

  proposeCombatLoadout = jest.fn(async () => this.proposedLoadout);

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

  it('simulates the leader with the gear and potions it would bring as the tank', async () => {
    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(leader.proposeCombatLoadout).toHaveBeenCalledWith(
      'lich',
      undefined,
      'tank',
      'default',
    );
    // Not the gear it is standing in: the sim runs before anyone gears up
    expect(leader.createFakeCharacterSchema).not.toHaveBeenCalledWith(
      leader.data,
    );
    expect(result.loadouts[0]).toMatchObject({
      weapon_slot: 'greater_dreadful_staff',
      utility1_slot: 'greater_health_potion',
      utility1_slot_quantity: 100,
      utility2_slot: 'fire_res_potion',
      utility2_slot_quantity: 60,
    });
  });

  it('asks each participant for the loadout that suits its role', async () => {
    await simulateBossFight(leader as never, { code: 'lich', quantity: 10 });

    expect(mockedLoadout.mock.calls).toEqual([
      ['BouncyBella', 'lich', 'dps'],
      ['JumpyJimmy', 'lich', 'healer'],
    ]);
  });

  it('falls back to a potion free schema when a participant cannot be reached', async () => {
    mockedLoadout.mockImplementation(async (charName: string) =>
      charName === 'JumpyJimmy'
        ? (new ApiError({ code: 500, message: 'unreachable' }) as never)
        : {
            message: 'ok',
            character: charName,
            proposedLoadout: loadoutFor(charName, 'gold_sword'),
          },
    );

    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    // Only the participant can see its own bank, so the leader cannot invent
    // potions on its behalf
    expect(result.loadouts[2]).toMatchObject({
      helmet_slot: 'JumpyJimmy_helm',
    });
    expect(result.loadouts[2].utility1_slot).toBeUndefined();
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

  it('reports -1 stats when the monster cannot be looked up', async () => {
    mockedMonster.mockResolvedValue(
      new ApiError({ code: 404, message: 'not found' }) as never,
    );

    const result = await simulateBossFight(leader as never, {
      code: 'lich',
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.winRate).toBe(-1);
    expect(result.averageTurns).toBe(-1);
    expect(result.loadouts).toEqual([]);
  });

  it('runs the sim for the requested number of iterations', async () => {
    await simulateBossFight(leader as never, { code: 'lich', quantity: 10 });

    const job = leader.executeJobNow.mock.calls[0][0] as FightSimulator;
    expect(job.iterations).toBe(10);
    expect(job.targetMobCode).toBe('lich');
  });

  it('gates on the ordinary win rate unless told otherwise', async () => {
    await simulateBossFight(leader as never, { code: 'lich', quantity: 10 });

    const job = leader.executeJobNow.mock.calls[0][0] as FightSimulator;
    expect(job.winRateThreshold).toBe(80);
  });
});

describe('simulateBossFight for a party that is not the boss roster', () => {
  it('asks each participant for the part its own roster gives them', async () => {
    await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 1 },
      { roster: RaidRoster },
    );

    expect(mockedLoadout).toHaveBeenNthCalledWith(
      1,
      'BouncyBella',
      'lich',
      'healer',
    );
    expect(mockedLoadout).toHaveBeenNthCalledWith(
      2,
      'JumpyJimmy',
      'lich',
      'healer',
    );
  });

  it('takes the leader part from the caller, not from the first participant', async () => {
    // The boss roster's first entry is the dps, so deriving the leader's part
    // from it would gear the tank as a damage dealer
    await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 1 },
      { roster: RaidRoster, leaderRole: RaidLeaderRole },
    );

    expect(leader.proposeCombatLoadout).toHaveBeenCalledWith(
      'pixie',
      undefined,
      'tank',
      'default',
    );
  });

  it('gates the sim at the threshold it was given', async () => {
    await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 1 },
      { winRateThreshold: RaidWinRateThreshold },
    );

    const job = leader.executeJobNow.mock.calls[0][0] as FightSimulator;
    expect(job.winRateThreshold).toBe(50);
  });
});

describe('simulateBossFight variant selection', () => {
  const pixie = {
    code: 'pixie',
    name: 'Pixie',
    type: 'raid_boss',
    level: 40,
    hp: 1200000,
    attack_air: 675,
    attack_earth: 0,
    attack_fire: 0,
    attack_water: 0,
    res_air: 5,
    res_earth: 5,
    res_fire: 10,
    res_water: 10,
    critical_strike: 5,
    initiative: 800,
    effects: [{ code: 'enchanted_mirror', value: 50 }],
  };

  const raidOptions = {
    roster: RaidRoster,
    leaderRole: RaidLeaderRole,
    winRateThreshold: RaidWinRateThreshold,
  };

  beforeEach(() => {
    mockedMonster.mockResolvedValue({ data: pixie } as never);
  });

  it('simulates every loadout variant the leader plan offers', async () => {
    await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 10 },
      raidOptions,
    );

    // tank plans offer threat / resist / bulk
    expect(leader.proposeCombatLoadout).toHaveBeenCalledTimes(3);
  });

  it('keeps the variant with the best win rate, not the last one tried', async () => {
    const rates = [20, 80, 50];
    let call = 0;
    leader.executeJobNow = jest.fn(async (job: FightSimulator) => {
      const winRate = rates[call++];
      job.winRate = winRate;
      job.averageTurns = 100;
      return winRate >= RaidWinRateThreshold
        ? ObjectiveCompleted
        : ObjectiveFailed;
    }) as never;

    const result = await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 10 },
      raidOptions,
    );

    expect(result.winRate).toBe(80);
    expect(result.success).toBe(true);
    expect(result.variant).toBe('resist');
  });

  it('asks each participant for its loadout once, however many variants it tries', async () => {
    await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 10 },
      raidOptions,
    );

    expect(mockedLoadout).toHaveBeenCalledTimes(RaidRoster.length);
  });

  it('stops at the first variant that clears the threshold', async () => {
    leader.executeJobNow = jest.fn(async (job: FightSimulator) => {
      job.winRate = 100;
      job.averageTurns = 100;
      return ObjectiveCompleted;
    }) as never;

    const result = await simulateBossFight(
      leader as never,
      { code: 'pixie', quantity: 10 },
      raidOptions,
    );

    expect(leader.proposeCombatLoadout).toHaveBeenCalledTimes(1);
    expect(result.variant).toBe('threat');
  });
});
