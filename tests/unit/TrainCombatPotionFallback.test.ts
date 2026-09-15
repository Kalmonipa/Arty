import { jest } from '@jest/globals';
import { EvaluateGearObjective } from '../../src/evaluateGear/evaluateGear.objective.js';
import { Character } from '../../src/character/character.js';
import { BankCache } from '../../src/core/BankCache.js';
import { CharacterSchema, ItemSchema } from '../../src/types/types.js';
import {
  BossFightPotionReserve,
  MaxEquippedUtilities,
} from '../../src/constants.js';
import { BossFightDps } from '../../src/fightBosses/bossFight.types.js';

const potion = (code: string, level: number): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type: 'utility',
    subtype: 'potion',
  }) as unknown as ItemSchema;

const healthPotion = potion('health_potion', 30);

const utilitiesMap = {
  boost_dmg_air: [],
  boost_dmg_earth: [],
  boost_dmg_fire: [],
  boost_dmg_water: [],
  boost_res_air: [],
  boost_res_earth: [],
  boost_res_fire: [],
  boost_res_water: [],
  boost_hp: [],
  restore: [healthPotion],
  splash_restore: [],
  antipoison: [],
};

const bankWith = (banked: number): BankCache =>
  ({
    stale: false,
    quantityOf: (code: string) => (code === healthPotion.code ? banked : 0),
    remove: jest.fn(),
  }) as unknown as BankCache;

/**
 * A fighter carrying nothing, with `banked` health potions in the bank, whose
 * gear selection is stubbed out so only the utility slots are under test.
 */
const fighter = (banked: number): Character => {
  const character = {
    data: {
      name: 'LongLegLarry',
      level: 35,
      utility1_slot: '',
      utility1_slot_quantity: 0,
      utility2_slot: '',
      utility2_slot_quantity: 0,
      inventory: [],
    } as unknown as CharacterSchema,
    utilitiesMap,
    getCharacterLevel: () => 35,
    getCharacterGearIn: () => '',
    checkQuantityOfItemInInv: () => 0,
    checkQuantityOfItemInBank: async (code: string) =>
      code === healthPotion.code ? banked : 0,
    createFakeCharacterSchema: (data: CharacterSchema) => ({ ...data }),
    topUpHealthPots: jest.fn(async () => undefined),
  } as unknown as Character;

  character.spareOutsideBossReserve =
    Character.prototype.spareOutsideBossReserve.bind(character);

  return character;
};

const proposeFor = async (
  banked: number,
  options: { usePotions?: boolean; bossFightRole?: typeof BossFightDps } = {},
) => {
  const character = fighter(banked);
  const job = new EvaluateGearObjective({
    character,
    activityType: 'combat',
    targetMob: 'ogre',
    bossFightRole: options.bossFightRole,
    usePotions: options.usePotions,
  });

  // chooseCombatGear reaches for the whole item catalogue; the utility slots
  // are what this test is about, so it is stubbed to change no gear
  (
    job as unknown as { chooseCombatGear: () => Promise<Map<string, string>> }
  ).chooseCombatGear = async () => new Map();

  return await job.proposeCombatLoadout(35, 'ogre', bankWith(banked));
};

describe('proposing a loadout with restore potions', () => {
  const plentiful = BossFightPotionReserve.restore + MaxEquippedUtilities;

  it('leaves the utility slots empty for an ordinary fight', async () => {
    const loadout = await proposeFor(plentiful);

    expect(loadout.utility1_slot).toBe('');
    expect(loadout.utility1_slot_quantity).toBe(0);
  });

  it('proposes restores when the caller asks for potions', async () => {
    const loadout = await proposeFor(plentiful, { usePotions: true });

    expect(loadout.utility1_slot).toBe(healthPotion.code);
    expect(loadout.utility1_slot_quantity).toBe(MaxEquippedUtilities);
  });

  // Simulating a win on the raid party's potions would send the character off
  // to a fight it is then equipped for with nothing
  it('does not count potions held back for boss fights', async () => {
    const loadout = await proposeFor(BossFightPotionReserve.restore, {
      usePotions: true,
    });

    expect(loadout.utility1_slot).toBe('');
  });

  it('proposes only what is spare above the reserve', async () => {
    const loadout = await proposeFor(BossFightPotionReserve.restore + 12, {
      usePotions: true,
    });

    expect(loadout.utility1_slot_quantity).toBe(12);
  });

  it('lets a boss fight dip into the reserve it is held for', async () => {
    const loadout = await proposeFor(BossFightPotionReserve.restore, {
      bossFightRole: BossFightDps,
    });

    expect(loadout.utility1_slot).toBe(healthPotion.code);
  });

  it('still defaults potions on for a boss fight role', async () => {
    const loadout = await proposeFor(plentiful, {
      bossFightRole: BossFightDps,
    });

    expect(loadout.utility1_slot).toBe(healthPotion.code);
  });

  it('lets a boss fight role opt out of potions explicitly', async () => {
    const loadout = await proposeFor(plentiful, {
      bossFightRole: BossFightDps,
      usePotions: false,
    });

    expect(loadout.utility1_slot).toBe('');
  });
});
