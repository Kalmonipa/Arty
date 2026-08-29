import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import * as fs from 'node:fs/promises';
import { Character } from '../../src/character/character.js';
import { CraftObjective } from '../../src/core/CraftObjective.js';
import { FightBossLeaderObjective } from '../../src/fightBosses/bossFightLeader.objective.js';
import { FightBossParticipantObjective } from '../../src/fightBosses/bossFightParticipant.objective.js';
import { Objective } from '../../src/core/Objective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

describe('job serialization round trip', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
  });

  it('keeps a resumed job pointing at the root of the tree it came from', async () => {
    const root = new CraftObjective(character, {
      code: 'steel_ring',
      quantity: 5,
    });
    const child = new CraftObjective(character, {
      code: 'iron_bar',
      quantity: 10,
    });
    character.jobList = [root, child];
    child.parentId = root.objectiveId;
    child.updateRootId();

    await character.parkJob(child);
    // The rest of the tree is gone by the time a parked job is resumed
    character.jobList = [];
    await character.resumeOnHoldJob(character.onHold[0]);

    expect(character.jobList[0].rootId).toBe(root.objectiveId);
  });
});

describe('surviving a restart', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
  });

  /**
   * Drives the real restart path: the queue is written out, then a fresh
   * character reads that same file back, exactly as a redeploy does
   */
  const afterRestart = async (jobs: Objective[]): Promise<Objective[]> => {
    character.jobList = jobs;
    await character.saveJobQueue();

    const writeFile = fs.writeFile as unknown as jest.Mock<
      (path: string, contents: string) => Promise<void>
    >;
    const written = writeFile.mock.calls.at(-1)[1];
    const readFile = fs.readFile as unknown as jest.Mock<() => Promise<string>>;
    readFile.mockResolvedValue(written);

    const restarted = new Character({ ...mockCharacterData });
    await restarted.loadJobQueue();

    return restarted.jobList;
  };

  it('keeps a boss fight the leader had queued', async () => {
    const restored = await afterRestart([
      new FightBossLeaderObjective(character, { code: 'lich', quantity: 3 }),
    ]);

    expect(restored).toHaveLength(1);
    expect(restored[0]).toBeInstanceOf(FightBossLeaderObjective);
    expect((restored[0] as FightBossLeaderObjective).target).toEqual({
      code: 'lich',
      quantity: 3,
    });
  });

  it('keeps a boss fight a participant was enlisted in', async () => {
    const restored = await afterRestart([
      new FightBossParticipantObjective(
        character,
        { code: 'lich', quantity: 3 },
        'healer',
        42,
      ),
    ]);

    expect(restored).toHaveLength(1);
    const participant = restored[0] as FightBossParticipantObjective;
    expect(participant).toBeInstanceOf(FightBossParticipantObjective);
    expect(participant.target).toEqual({ code: 'lich', quantity: 3 });
    expect(participant.role).toBe('healer');
    // Without the id it can't tell whether the fight it was enlisted in is
    // still running, so it would wait on a fight that no longer exists
    expect(participant.fightId).toBe(42);
  });
});
