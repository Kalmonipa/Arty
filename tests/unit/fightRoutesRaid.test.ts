import { jest } from '@jest/globals';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

jest.mock('../../src/fightBosses/bossfightPreRequisite.js', () => ({
  simulateBossFight: jest.fn(),
}));

jest.mock('../../src/api_calls/Raids.js', () => ({
  findRaid: jest.fn(),
}));

import { findRaid } from '../../src/api_calls/Raids.js';
import { simulateBossFight } from '../../src/fightBosses/bossfightPreRequisite.js';
import {
  RaidLeaderRole,
  RaidRoster,
  RaidWinRateThreshold,
} from '../../src/fightRaids/raid.utils.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import FightRouter from '../../src/fights/fight.routes.js';
import { RaidLeaderObjective } from '../../src/fightRaids/raidLeader.objective.js';
import { Objective } from '../../src/core/Objective.js';

const mockedFindRaid = findRaid as jest.MockedFunction<typeof findRaid>;
const mockedSimulate = simulateBossFight as jest.MockedFunction<
  typeof simulateBossFight
>;

const appended: Objective[] = [];

const character = {
  data: { name: 'LongLegLarry' },
  appendJob: jest.fn(async (job: Objective) => {
    appended.push(job);
  }),
} as never;

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

beforeEach(() => {
  jest.clearAllMocks();
  appended.length = 0;
  mockedFindRaid.mockResolvedValue({
    code: 'enchanted_fairy',
    monster: 'pixie',
    status: 'active',
  } as never);
  mockedSimulate.mockResolvedValue({
    ...ObjectiveCompleted,
    winRate: 60,
    averageTurns: 100,
    loadouts: [],
  });
});

const startRaid = (body: unknown) =>
  fetch(`${baseUrl}/fight/raid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /fight/raid', () => {
  it('queues a raid for the named raid', async () => {
    const response = await startRaid({ raid: 'enchanted_fairy' });

    expect(response.status).toBe(201);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toBeInstanceOf(RaidLeaderObjective);
    expect((appended[0] as RaidLeaderObjective).target).toEqual({
      code: 'enchanted_fairy',
    });
  });

  it('takes the monster code just as happily', async () => {
    // findRaid resolves either, so a caller need not know which name it holds
    const response = await startRaid({ raid: 'pixie' });

    expect(response.status).toBe(201);
    expect((appended[0] as RaidLeaderObjective).target).toEqual({
      code: 'pixie',
    });
  });

  it('rejects a request that names no raid', async () => {
    const response = await startRaid({});

    expect(response.status).toBe(400);
    expect(appended).toHaveLength(0);
  });

  it('asks for no quantity, since a raid has none', async () => {
    // It runs until the boss dies or the party loses three in a row
    const response = await startRaid({ raid: 'enchanted_fairy', quantity: 5 });

    expect(response.status).toBe(201);
    expect((appended[0] as RaidLeaderObjective).target).toEqual({
      code: 'enchanted_fairy',
    });
  });
});

const simulateRaid = (body: unknown) =>
  fetch(`${baseUrl}/fight/raid/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /fight/raid/simulate', () => {
  it('simulates the monster with the raid party and the raid win bar', async () => {
    const response = await simulateRaid({ raid: 'enchanted_fairy' });

    expect(response.status).toBe(200);

    const [, target, options] = mockedSimulate.mock.calls[0];
    expect(target.code).toBe('pixie');
    expect(options?.roster).toBe(RaidRoster);
    expect(options?.leaderRole).toBe(RaidLeaderRole);
    expect(options?.winRateThreshold).toBe(RaidWinRateThreshold);
  });

  it('reports the win rate the sim produced', async () => {
    const response = await simulateRaid({ raid: 'pixie' });

    await expect(response.json()).resolves.toMatchObject({
      winRate: 60,
      averageTurns: 100,
    });
  });

  it('rejects a request that names no raid', async () => {
    const response = await simulateRaid({});

    expect(response.status).toBe(400);
    expect(mockedSimulate).not.toHaveBeenCalled();
  });

  it('says so when there is no such raid', async () => {
    mockedFindRaid.mockResolvedValue(undefined);

    const response = await simulateRaid({ raid: 'lich' });

    expect(response.status).toBe(404);
    expect(mockedSimulate).not.toHaveBeenCalled();
  });
});
