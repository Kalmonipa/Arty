import { jest } from '@jest/globals';

const mockGetAllMonsterInformation = jest.fn();

jest.mock('../../src/api_calls/Monsters.js', () => ({
  getAllMonsterInformation: mockGetAllMonsterInformation,
}));

import { TrainCombatObjective } from '../../src/core/TrainCombatObjective.js';
import { BankCache } from '../../src/bank/bank.cache.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import { Character } from '../../src/character/character.js';
import { CharacterSchema } from '../../src/types/types.js';

const ogre = { code: 'ogre', level: 30 };

type Options = {
  /** Mob codes a dry loadout beats; anything else needs potions */
  winnableDry?: string[];
  /** Mob codes a potioned loadout beats */
  winnableWithPotions?: string[];
};

const trainee = (options: Options = {}) => {
  const { winnableDry = [], winnableWithPotions = [] } = options;
  let level = 30;

  const proposeCombatLoadout = jest.fn(
    async (mob: string, opts: { usePotions?: boolean } = {}) => ({
      mob,
      usePotions: opts.usePotions === true,
    }),
  );

  const simulateFightNow = jest.fn(
    async (loadouts: { mob: string; usePotions: boolean }[]) => {
      const [{ mob, usePotions }] = loadouts;
      const winnable = usePotions ? winnableWithPotions : winnableDry;
      return { success: winnable.includes(mob) };
    },
  );

  const fightNow = jest.fn(async () => {
    level = 50;
    return { success: true };
  });

  const character = {
    data: { name: 'LongLegLarry' } as unknown as CharacterSchema,
    getCharacterLevel: () => level,
    handleErrors: jest.fn(),
    proposeCombatLoadout,
    simulateFightNow,
    evaluateGear: jest.fn(async () => ObjectiveCompleted),
    fightNow,
  } as unknown as Character;

  return { character, proposeCombatLoadout, simulateFightNow, fightNow };
};

const runTraining = async (character: Character) => {
  const job = new TrainCombatObjective(character, 50);
  jest
    .spyOn(BankCache, 'create')
    .mockResolvedValue({ stale: false } as unknown as BankCache);
  return await job.run();
};

describe('training combat when nothing is winnable bare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllMonsterInformation.mockResolvedValue({ data: [ogre] } as never);
  });

  it('fights a mob the character beats without potions', async () => {
    const { character, fightNow, proposeCombatLoadout } = trainee({
      winnableDry: ['ogre'],
    });

    const result = await runTraining(character);

    expect(result).toEqual(ObjectiveCompleted);
    expect(fightNow).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ogre', useHealthPots: false }),
    );
    // No reason to re-simulate with potions once a mob is already winnable
    expect(
      proposeCombatLoadout.mock.calls.some(([, opts]) => opts?.usePotions),
    ).toBe(false);
  });

  it('looks again with potions when no mob is winnable bare', async () => {
    const { character, fightNow } = trainee({
      winnableWithPotions: ['ogre'],
    });

    const result = await runTraining(character);

    expect(result).toEqual(ObjectiveCompleted);
    expect(fightNow).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ogre', useHealthPots: true }),
    );
  });

  it('gears up with potions for the fight it simulated with them', async () => {
    const { character } = trainee({ winnableWithPotions: ['ogre'] });

    await runTraining(character);

    expect(character.evaluateGear).toHaveBeenCalledWith(
      expect.objectContaining({ targetMob: 'ogre', usePotions: true }),
    );
  });

  it('only escalates after the dry attempts are used up', async () => {
    const { character, proposeCombatLoadout } = trainee({
      winnableWithPotions: ['ogre'],
    });

    await runTraining(character);

    const dryAttempts = proposeCombatLoadout.mock.calls.filter(
      ([, opts]) => !opts?.usePotions,
    );
    expect(dryAttempts).toHaveLength(3);
  });

  it('fails when potions do not make anything winnable either', async () => {
    const { character, fightNow } = trainee();

    const result = await runTraining(character);

    expect(result.success).toBe(false);
    expect(fightNow).not.toHaveBeenCalled();
  });
});
