import { jest } from '@jest/globals';
import { BankCache } from '../../src/core/BankCache.js';
import { IdleHealerObjective } from '../../src/idleObjectives/IdleHealer.js';
import { EvaluateGearObjective } from '../../src/core/EvaluateGearObjective.js';
import { Character } from '../../src/character/CharacterClass.js';
import { ItemSchema } from '../../src/types/types.js';

const teleportPotion = (code: string, level: number): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'utility',
    subtype: 'potion',
  }) as ItemSchema;

/**
 * A character whose bank read always fails, as it does under a 429. Everything
 * else is stubbed just enough for the top-up path to run.
 */
const characterWithUnreadableBank = (craftNow: jest.Mock) =>
  ({
    data: { name: 'ZippyZoe', level: 30 },
    getAllBankItems: jest.fn(async () => undefined),
    getCharacterLevel: () => 30,
    consumablesMap: {
      teleport: [teleportPotion('minor_teleport_potion', 10)],
      heal: [],
    },
    craftNow,
  }) as unknown as Character;

describe('stale bank snapshot guards', () => {
  it('does not craft teleport potions off a snapshot that failed to load', async () => {
    const craftNow = jest.fn(async () => true);
    const character = characterWithUnreadableBank(craftNow);
    const healer = new IdleHealerObjective(character);

    await (
      healer as unknown as {
        topUpTeleportPotionsInBank: () => Promise<boolean>;
      }
    ).topUpTeleportPotionsInBank();

    // A stale cache reports 0 of everything. Acting on that would craft a full
    // 50 of every tier the character can make, on top of whatever is already
    // banked, purely because we were rate limited.
    expect(craftNow).not.toHaveBeenCalled();
  });

  it('abandons a gear evaluation whose bank snapshot failed to load', async () => {
    const recoverHealth = jest.fn(async () => true);
    const character = {
      data: { name: 'LongLegLarry', level: 30 },
      getAllBankItems: jest.fn(async () => undefined),
      getCharacterLevel: () => 30,
      recoverHealth,
    } as unknown as Character;

    const objective = new EvaluateGearObjective(character, 'combat', 'chicken');
    objective.checkStatus = jest.fn(async () => true) as never;

    const result = await objective.run();

    // Without the snapshot every slot reads as "we own none of it", so the pass
    // can only ever conclude "change nothing" — at the cost of a full retry
    // loop. Bail instead and let the job come back when the budget recovers.
    expect(result.success).toBe(false);
    expect(recoverHealth).not.toHaveBeenCalled();
  });

  it('exposes staleness so callers can tell an empty bank from an unread one', async () => {
    const unread = await BankCache.create({
      getAllBankItems: async () => undefined,
    } as unknown as Character);
    const empty = await BankCache.create({
      getAllBankItems: async () => [],
    } as unknown as Character);

    expect(unread.stale).toBe(true);
    expect(empty.stale).toBe(false);
  });
});
