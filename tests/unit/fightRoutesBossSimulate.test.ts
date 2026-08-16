import { jest } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

jest.mock('../../src/fightBosses/bossfightPreRequisite.js', () => ({
  simulateBossFight: jest.fn(),
}));

import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import FightRouter from '../../src/fights/Routes.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';

const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;

const character = { data: { name: 'LongLegLarry' } } as never;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/fight', FightRouter(character));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('POST /fight/boss/simulate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function simulate() {
    const response = await fetch(`${baseUrl}/fight/boss/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetMob: 'lich', quantity: 10 }),
    });
    return (await response.json()) as {
      message: string;
      winRate: number;
      averageTurns: number;
      loadouts: { weapon_slot: string }[];
    };
  }

  it('reports a win when the sim succeeded', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 100,
      averageTurns: 14,
      loadouts: [],
    });

    const body = await simulate();

    expect(body.message).toBe('Boss fight sim against lich was a win');
  });

  it('reports a loss when the sim failed', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveFailed,
      winRate: 0,
      averageTurns: 0,
      loadouts: [],
    });

    const body = await simulate();

    expect(body.message).toBe('Boss fight sim against lich was a loss');
  });

  it('reports how close the party came, not just the verdict', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveFailed,
      winRate: 40,
      averageTurns: 26,
      loadouts: [],
    });

    const body = await simulate();

    expect(body.winRate).toBe(40);
    expect(body.averageTurns).toBe(26);
  });

  it('reports the loadouts the sim was run with', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveFailed,
      winRate: 0,
      averageTurns: 0,
      loadouts: [
        { weapon_slot: 'greater_dreadful_staff' },
        { weapon_slot: 'gold_sword' },
      ] as never,
    });

    const body = await simulate();

    expect(body.loadouts.map((loadout) => loadout.weapon_slot)).toEqual([
      'greater_dreadful_staff',
      'gold_sword',
    ]);
  });
});
