import { jest } from '@jest/globals';

jest.mock('../../src/fightBosses/bossFightParticipantFunctions.js', () => ({
  checkEnlistments: jest.fn(),
}));

jest.mock('../../src/fightBosses/bossFight.utils.js', () => ({
  getBossFightTarget: jest.fn(),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => null),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
  getWishlistRequestsForJob: jest.fn(async () => []),
}));

import { Character } from '../../src/character/character.js';
import { getBossFightTarget } from '../../src/fightBosses/bossFight.utils.js';
import { checkEnlistments } from '../../src/fightBosses/bossFightParticipantFunctions.js';
import { FightBossParticipantObjective } from '../../src/fightBosses/bossFightParticipant.objective.js';
import { RaidParticipantObjective } from '../../src/fightRaids/raidParticipant.objective.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const mockedEnlistments = checkEnlistments as jest.MockedFunction<
  typeof checkEnlistments
>;
const mockedTarget = getBossFightTarget as jest.MockedFunction<
  typeof getBossFightTarget
>;

describe('answering a call-up', () => {
  let character: Character;
  let executed: unknown[];

  beforeEach(() => {
    jest.clearAllMocks();
    executed = [];

    character = new Character({ ...mockCharacterData, name: 'BouncyBella' });
    character.executeJobNow = jest.fn(async (job: unknown) => {
      executed.push(job);
      return ObjectiveCompleted;
    }) as never;

    mockedTarget.mockResolvedValue({ code: 'lich', quantity: 3 });
  });

  it('joins a boss fight as a boss fight participant', async () => {
    mockedEnlistments.mockResolvedValue({
      fightId: 7,
      role: 'healer',
      isRaid: false,
    });

    await character.checkForBossFightParticipation();

    expect(executed[0]).toBeInstanceOf(FightBossParticipantObjective);
  });

  it('joins a raid as a raid participant', async () => {
    // The row lives in the same table, but a raid participant gears against a
    // different target and waits on the raid rather than a fight count
    mockedEnlistments.mockResolvedValue({
      fightId: 8,
      role: 'tank',
      isRaid: true,
    });
    mockedTarget.mockResolvedValue({ code: 'enchanted_fairy', quantity: 1 });

    await character.checkForBossFightParticipation();

    expect(executed[0]).toBeInstanceOf(RaidParticipantObjective);
    const job = executed[0] as RaidParticipantObjective;
    expect(job.target).toEqual({ code: 'enchanted_fairy' });
    expect(job.role).toBe('tank');
    expect(job.fightId).toBe(8);
  });

  it('does not queue a second raid on top of one already running', async () => {
    mockedEnlistments.mockResolvedValue({
      fightId: 8,
      role: 'tank',
      isRaid: true,
    });
    character.jobList = [
      new RaidParticipantObjective(
        character,
        { code: 'enchanted_fairy' },
        'tank',
        8,
      ),
    ];

    const result = await character.checkForBossFightParticipation();

    expect(result.success).toBe(false);
    expect(executed).toHaveLength(0);
  });
});
