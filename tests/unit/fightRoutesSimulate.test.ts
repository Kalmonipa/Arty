import { jest } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

jest.mock('../../src/fights/soloFightSim.js', () => ({
  simulateSoloFight: jest.fn(),
}));

import { simulateSoloFight } from '../../src/fights/soloFightSim.js';
import FightRouter from '../../src/fights/fight.routes.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';

const mockedSimulate = simulateSoloFight as jest.MockedFunction<
  typeof simulateSoloFight
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

describe('POST /fight/simulate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function simulate(body: Record<string, unknown> = {
    targetMob: 'cultist_emperor',
    quantity: 10,
  }) {
    const response = await fetch(`${baseUrl}/fight/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        message: string;
        error?: string;
        winRate: number;
        averageTurns: number;
        loadout?: { weapon_slot: string; utility1_slot: string };
      },
    };
  }

  it('reports a win when the sim succeeded', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 100,
      averageTurns: 9,
    });

    const { status, body } = await simulate();

    expect(status).toBe(200);
    expect(body.message).toBe('Fight sim against cultist_emperor was a win');
  });

  it('reports how close the character came, not just the verdict', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveFailed,
      winRate: 40,
      averageTurns: 22,
    });

    const { body } = await simulate();

    expect(body.message).toBe('Fight sim against cultist_emperor was a loss');
    expect(body.winRate).toBe(40);
    expect(body.averageTurns).toBe(22);
  });

  it('reports the loadout the sim was run with', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 90,
      averageTurns: 15,
      loadout: {
        weapon_slot: 'greater_dreadful_staff',
        utility1_slot: 'health_potion',
      } as never,
    });

    const { body } = await simulate();

    expect(body.loadout.weapon_slot).toBe('greater_dreadful_staff');
    expect(body.loadout.utility1_slot).toBe('health_potion');
  });

  it('passes the requested mob and iteration count to the sim', async () => {
    mockedSimulate.mockResolvedValue({
      ...ObjectiveCompleted,
      winRate: 100,
      averageTurns: 9,
    });

    await simulate({ targetMob: 'lich', quantity: 25 });

    expect(mockedSimulate).toHaveBeenCalledWith(character, {
      code: 'lich',
      quantity: 25,
    });
  });

  it('rejects a request with no target mob', async () => {
    const { status, body } = await simulate({ quantity: 10 });

    expect(status).toBe(400);
    expect(body.error).toBe('Invalid quantity or targetMob.');
    expect(mockedSimulate).not.toHaveBeenCalled();
  });
});
