import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Monsters', () => ({
  getMonsterInformation: jest.fn(),
}));

jest.mock('../../src/core/BankCache', () => ({
  BankCache: { create: jest.fn() },
}));

import { getMonsterInformation } from '../../src/api_calls/Monsters.js';
import { BankCache } from '../../src/core/BankCache.js';
import { simulateSoloFight } from '../../src/fights/soloFightSim.js';
import { Character } from '../../src/character/character.js';
import { ApiError } from '../../src/core/Error.js';
import { ItemSchema, MonsterSchema } from '../../src/types/types.js';
import {
  FightSimVerdict,
  ObjectiveCompleted,
  ObjectiveFailed,
} from '../../src/types/ObjectiveData.js';

const mockedMonster = getMonsterInformation as jest.MockedFunction<
  typeof getMonsterInformation
>;
const mockedBank = BankCache.create as jest.MockedFunction<
  typeof BankCache.create
>;

const potion = (code: string, level: number): ItemSchema =>
  ({ code, name: code, level, type: 'utility', subtype: 'potion' }) as never;

const smallHealth = potion('small_health_potion', 5);
const health = potion('health_potion', 30);
const smallAntidote = potion('small_antidote', 20);

const mob = (effects?: { code: string; value: number }[]): MonsterSchema =>
  ({ code: 'cultist_emperor', name: 'Cultist Emperor', level: 40, effects }) as never;

const bankWith = (stock: Record<string, number>): BankCache =>
  ({
    stale: false,
    quantityOf: (code: string) => stock[code] ?? 0,
  }) as unknown as BankCache;

const verdict = (winRate: number, success: boolean): FightSimVerdict => ({
  ...(success ? ObjectiveCompleted : ObjectiveFailed),
  winRate,
  averageTurns: success ? 12 : 0,
});

/**
 * A fighter whose gear selection is stubbed to a fixed loadout, so only the
 * escalation between simulated runs is under test.
 */
const fighter = (verdicts: FightSimVerdict[]) => {
  const simulateFightNow = jest.fn(async () => verdicts.shift() ?? verdict(0, false));

  const character = {
    data: { name: 'LongLegLarry', level: 40 },
    utilitiesMap: {
      restore: [smallHealth, health],
      antipoison: [smallAntidote],
    },
    getCharacterLevel: () => 40,
    checkQuantityOfItemInInv: () => 0,
    handleErrors: jest.fn(async () => undefined),
    proposeCombatLoadout: jest.fn(async () => ({
      level: 40,
      weapon_slot: 'greater_dreadful_staff',
      utility1_slot: '',
      utility1_slot_quantity: 0,
      utility2_slot: '',
      utility2_slot_quantity: 0,
    })),
    simulateFightNow,
  } as unknown as Character;

  return { character, simulateFightNow };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedMonster.mockResolvedValue({ data: mob() } as never);
  mockedBank.mockResolvedValue(bankWith({}));
});

describe('simulateSoloFight', () => {
  it('reports a win on the gear alone without reaching for potions', async () => {
    const { character, simulateFightNow } = fighter([verdict(100, true)]);
    mockedBank.mockResolvedValue(bankWith({ health_potion: 50 }));

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(true);
    expect(result.winRate).toBe(100);
    expect(simulateFightNow).toHaveBeenCalledTimes(1);
    expect(result.loadout.utility1_slot).toBe('');
  });

  it('asks for the loadout the character would wear, not the one it stands in', async () => {
    const { character } = fighter([verdict(100, true)]);

    await simulateSoloFight(character, { code: 'cultist_emperor', quantity: 10 });

    expect(character.proposeCombatLoadout).toHaveBeenCalledWith(
      'cultist_emperor',
      expect.objectContaining({ usePotions: false }),
    );
  });

  it('re-simulates with the strongest stocked restore potion when the dry run loses', async () => {
    const { character, simulateFightNow } = fighter([
      verdict(20, false),
      verdict(90, true),
    ]);
    mockedBank.mockResolvedValue(bankWith({ health_potion: 50 }));

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(true);
    expect(result.loadout.utility1_slot).toBe('health_potion');
    expect(result.loadout.utility1_slot_quantity).toBe(50);
    expect(simulateFightNow).toHaveBeenCalledTimes(2);
  });

  it('leaves the potions alone when the bank has none to spare', async () => {
    const { character, simulateFightNow } = fighter([verdict(20, false)]);

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.winRate).toBe(20);
    expect(simulateFightNow).toHaveBeenCalledTimes(1);
  });

  it('tries an antidote before restores against a poisonous mob', async () => {
    mockedMonster.mockResolvedValue({
      data: mob([{ code: 'poison', value: 30 }]),
    } as never);
    mockedBank.mockResolvedValue(bankWith({ small_antidote: 20 }));
    const { character, simulateFightNow } = fighter([
      verdict(20, false),
      verdict(95, true),
    ]);

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(true);
    expect(result.loadout.utility2_slot).toBe('small_antidote');
    expect(simulateFightNow).toHaveBeenCalledTimes(2);
  });

  it('carries the antidote alongside the restores when neither wins alone', async () => {
    mockedMonster.mockResolvedValue({
      data: mob([{ code: 'poison', value: 30 }]),
    } as never);
    mockedBank.mockResolvedValue(
      bankWith({ small_antidote: 20, health_potion: 50 }),
    );
    const { character } = fighter([
      verdict(10, false),
      verdict(30, false),
      verdict(85, true),
    ]);

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(true);
    expect(result.loadout.utility1_slot).toBe('health_potion');
    expect(result.loadout.utility2_slot).toBe('small_antidote');
  });

  it('keeps the closest run when every escalation loses', async () => {
    mockedBank.mockResolvedValue(bankWith({ health_potion: 50 }));
    const { character } = fighter([verdict(40, false), verdict(15, false)]);

    const result = await simulateSoloFight(character, {
      code: 'cultist_emperor',
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.winRate).toBe(40);
    expect(result.loadout.utility1_slot).toBe('');
  });

  it('gives up when the monster cannot be read', async () => {
    mockedMonster.mockResolvedValue(
      new ApiError({ message: 'not found', code: 404 } as never),
    );
    const { character, simulateFightNow } = fighter([]);

    const result = await simulateSoloFight(character, {
      code: 'nonsense',
      quantity: 10,
    });

    expect(result.success).toBe(false);
    expect(result.winRate).toBe(-1);
    expect(simulateFightNow).not.toHaveBeenCalled();
  });
});
