import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Actions.js', () => ({
  fightSimulator: jest.fn(),
}));

import { fightSimulator } from '../../src/api_calls/Actions.js';
import { FightSimulator } from '../../src/fights/fight.simulator.js';
import { FakeCharacterSchema } from '../../src/types/types.js';

const mockedSimulator = fightSimulator as jest.MockedFunction<
  typeof fightSimulator
>;

const character = {
  data: { name: 'LongLegLarry' },
  jobList: [],
  handleErrors: jest.fn(async () => true),
} as never;

const loadout = () =>
  ({ level: 40, weapon_slot: 'diamond_sword' }) as FakeCharacterSchema;

function simWinRate(winrate: number) {
  mockedSimulator.mockResolvedValue({
    data: { results: [], wins: 0, losses: 0, winrate },
  } as never);
}

describe('how sure the sim has to be before committing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('commits an ordinary fight at 80%', async () => {
    simWinRate(80);

    const sim = new FightSimulator(character, [loadout()], 'lich', 10);

    expect((await sim.run()).success).toBe(true);
  });

  it('refuses an ordinary fight just under 80%', async () => {
    simWinRate(79);

    const sim = new FightSimulator(character, [loadout()], 'lich', 10);

    expect((await sim.run()).success).toBe(false);
  });

  it('commits at a lowered bar', async () => {
    // A raid trades a lost cooldown for damage on the shared pool, so it is
    // worth attempting at odds an ordinary fight would refuse
    simWinRate(50);

    const sim = new FightSimulator(character, [loadout()], 'pixie', 10, {
      winRateThreshold: 50,
    });

    expect((await sim.run()).success).toBe(true);
  });

  it('still refuses below the lowered bar', async () => {
    simWinRate(49);

    const sim = new FightSimulator(character, [loadout()], 'pixie', 10, {
      winRateThreshold: 50,
    });

    expect((await sim.run()).success).toBe(false);
  });
});
