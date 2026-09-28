import { getMonsterInformation } from '../api_calls/Monsters.js';
import { Character } from '../character/character.js';
import { BankCache } from '../bank/bank.cache.js';
import { ApiError } from '../core/Error.js';
import { Antidote, Restore } from '../gameDataConstants.js';
import {
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { FakeCharacterSchema } from '../types/types.js';
import { UtilityEffects } from '../types/ItemData.js';
import { logger, usableUtilityTiers } from '../utils.js';
import { SoloFightSimResult } from './fight.types.js';

/**
 * A verdict with nothing behind it, for the paths that never reach the sim.
 * Sets -1 so that it's obvious it is a failure rather than a quick fight.
 */
function noSimResult(result: ObjectiveResult): SoloFightSimResult {
  return { ...result, winRate: -1, averageTurns: -1 };
}

/**
 * @description Answers whether a character can beat a mob on its own with the
 * gear and potions it can currently lay hands on, without queueing a fight or
 * moving a single item.
 *
 * Follows the same escalation a real {@link FightObjective} does: the fight is
 * judged dry first, and potions are only added to a fight that is lost without
 * them. Unlike the real thing, every tier considered has to actually be in
 * stock, so the verdict is about the fleet as it stands rather than the
 * potions it could brew.
 */
export async function simulateSoloFight(
  character: Character,
  target: ObjectiveTargets,
): Promise<SoloFightSimResult> {
  const mobInfo = await getMonsterInformation(target.code);
  if (mobInfo instanceof ApiError) {
    await character.handleErrors(mobInfo);
    return noSimResult(ObjectiveFailed);
  }

  const bank = await BankCache.create(character);
  if (bank.stale) {
    logger.warn(
      `Could not read the bank; judging ${target.code} on carried stock alone`,
    );
  }

  // Simulating the gear the character happens to be standing in would judge the
  // fight on a gathering tool, so ask for the loadout it would wear instead
  const gearOnly = await character.proposeCombatLoadout(target.code, {
    cache: bank,
    usePotions: false,
  });

  const dry = await character.simulateFightNow(
    [gearOnly],
    target.code,
    target.quantity,
  );

  logger.info(
    `Dry sim against ${target.code} was a ${dry.success ? 'win' : 'loss'} at a ${dry.winRate}% win rate`,
  );

  let best: SoloFightSimResult = { ...dry, loadout: gearOnly };
  if (dry.success) {
    return best;
  }

  let withAntidote = gearOnly;

  const poisons = mobInfo.data.effects?.some(
    (effect) => effect.code === 'poison',
  );
  const antidotes = poisons ? stockedTiers(character, bank, Antidote) : [];

  // Weakest first. A tier that neutralises less poison than the mob inflicts
  // can still carry the fight, and it's the tier the bank holds most of
  for (const { item, available } of antidotes) {
    const candidate: FakeCharacterSchema = {
      ...gearOnly,
      utility2_slot: item.code,
      utility2_slot_quantity: available,
    };

    const attempt = await character.simulateFightNow(
      [candidate],
      target.code,
      target.quantity,
    );

    logger.info(
      `Sim against ${target.code} with ${available} ${item.code} was a ${attempt.success ? 'win' : 'loss'} at a ${attempt.winRate}% win rate`,
    );

    best = closerOf(best, { ...attempt, loadout: candidate });
    if (attempt.success) {
      return best;
    }

    // None of them wins on its own, but the poison still lands, so the restore
    // run carries the strongest tier we hold
    withAntidote = candidate;
  }

  const restores = stockedTiers(character, bank, Restore);
  if (restores.length === 0) {
    logger.info(`No restore potion in stock to throw at ${target.code}`);
    return best;
  }

  const { item, available } = restores.at(-1);
  const withRestores: FakeCharacterSchema = {
    ...withAntidote,
    utility1_slot: item.code,
    utility1_slot_quantity: available,
  };

  const potioned = await character.simulateFightNow(
    [withRestores],
    target.code,
    target.quantity,
  );

  logger.info(
    `Sim against ${target.code} with ${available} ${item.code} was a ${potioned.success ? 'win' : 'loss'} at a ${potioned.winRate}% win rate`,
  );

  return closerOf(best, { ...potioned, loadout: withRestores });
}

function closerOf(
  best: SoloFightSimResult,
  candidate: SoloFightSimResult,
): SoloFightSimResult {
  return candidate.winRate > best.winRate ? candidate : best;
}

/**
 * @description The tiers of a utility the character is both high enough level
 * to equip and holds enough of to matter, weakest first.
 */
function stockedTiers(
  character: Character,
  bank: BankCache,
  effect: UtilityEffects,
) {
  return usableUtilityTiers(
    character.utilitiesMap?.[effect] ?? [],
    character.getCharacterLevel(character.data),
    (code) => character.checkQuantityOfItemInInv(code) + bank.quantityOf(code),
  );
}
