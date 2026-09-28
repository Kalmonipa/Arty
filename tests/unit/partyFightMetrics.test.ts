import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Objective } from '../../src/core/objective.js';
import { RaidLeaderObjective } from '../../src/fightRaids/raidLeader.objective.js';
import { RaidParticipantObjective } from '../../src/fightRaids/raidParticipant.objective.js';
import { FightBossLeaderObjective } from '../../src/fightBosses/bossFightLeader.objective.js';
import { FightBossParticipantObjective } from '../../src/fightBosses/bossFightParticipant.objective.js';
import {
  BossFightHealer,
  BossFightTank,
} from '../../src/fightBosses/bossFight.types.js';

const character = { data: { name: 'LongLegLarry' }, jobList: [] } as never;

/** shouldEmitMetrics is protected; the dashboards only care that it is on */
const emits = (job: Objective) =>
  (job as unknown as { shouldEmitMetrics: boolean }).shouldEmitMetrics;

const pixie = { code: 'pixie', quantity: 1 };

describe('raid and boss fight jobs report to the dashboards', () => {
  // Every raid the fleet ever ran was invisible in Prometheus: job_type carried
  // ten values and none of them were a raid or a boss fight, so "did they fight
  // last night" could only be answered by grepping five containers' logs.
  const jobs: [string, () => Objective, string][] = [
    [
      'RaidLeaderObjective',
      () => new RaidLeaderObjective(character, { code: 'enchanted_fairy' }),
      'enchanted_fairy',
    ],
    [
      'RaidParticipantObjective',
      () =>
        new RaidParticipantObjective(
          character,
          { code: 'enchanted_fairy' },
          BossFightHealer,
          25,
        ),
      'enchanted_fairy',
    ],
    [
      'FightBossLeaderObjective',
      () => new FightBossLeaderObjective(character, pixie),
      'pixie',
    ],
    [
      'FightBossParticipantObjective',
      () =>
        new FightBossParticipantObjective(character, pixie, BossFightTank, 25),
      'pixie',
    ],
  ];

  it.each(jobs)('%s emits metrics', (_name, build) => {
    expect(emits(build())).toBe(true);
  });

  it.each(jobs)(
    '%s labels the metric with what it is fighting',
    (_name, build, expected) => {
      expect(build().metricLabel).toBe(expected);
    },
  );

  it.each(jobs)('%s keeps a job_type of its own', (_name, build) => {
    expect(build().jobFlavour).toBeTruthy();
  });

  it('gives the four of them distinct job types', () => {
    const flavours = jobs.map(([, build]) => build().jobFlavour);
    expect(new Set(flavours).size).toBe(flavours.length);
  });
});
