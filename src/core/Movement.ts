import { ForestBankPotion, RecallPotion } from '../names.js';
import { logger } from '../utils.js';
import { MapLayer } from '../types/types.js';
import { SANDWHISPER_Y_BOUNDARY } from './TransitionPathfinder.js';
import { Character } from './Character.js';

/**
 * @description Move to the Overworld -> SW Isle transition point
 * Withdraws a recall potion before transitioning, or if none available withdraws 2k gold
 * @returns true if successful, false if unsuccessful
 */
export async function transitionToSandwhisperIsle(
  character: Character,
): Promise<boolean> {
  const recallPotsInInv = character.checkQuantityOfItemInInv(RecallPotion);
  const forestBankPotsInInv =
    character.checkQuantityOfItemInInv(ForestBankPotion);
  const potionInInv = recallPotsInInv > 0 || forestBankPotsInInv > 0;

  const recallPotsInBank =
    await character.checkQuantityOfItemInBank(RecallPotion);
  const forestBankPotsInBank =
    await character.checkQuantityOfItemInBank(ForestBankPotion);
  const potionInBank = recallPotsInBank > 0 || forestBankPotsInBank > 0;

  if (!potionInBank && !potionInInv) {
    // No return potion available — withdraw 2k gold to pay for transition there and back
    logger.info(`Withdrawing 2000 gold before travelling to Sandwhisper`);
    await character.withdrawNow(2000, 'gold');
  } else if (!potionInInv && potionInBank) {
    // Withdraw whichever return potion is available, plus 1k gold for the outbound trip
    const potionToWithdraw =
      recallPotsInBank > 0 ? RecallPotion : ForestBankPotion;
    await character.withdrawNow(1, potionToWithdraw);
    character.addItemToItemsToKeep(potionToWithdraw);
    await character.withdrawNow(1000, 'gold');
  } else if (potionInInv) {
    // Already have a return potion in inventory — just withdraw 1k gold for the outbound trip
    await character.withdrawNow(1000, 'gold');
  }

  const transitionPoint = character.transitionLocations.find(
    (t) =>
      t.layer === MapLayer.overworld &&
      t.y < SANDWHISPER_Y_BOUNDARY &&
      t.interactions.transition?.layer === MapLayer.overworld &&
      t.interactions.transition.y >= SANDWHISPER_Y_BOUNDARY,
  );
  if (!transitionPoint) {
    logger.error(
      'Could not find mainland -> Sandwhisper Isle transition point',
    );
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}

/**
 * @description Moves to the SW Isle -> Mainland transition point, or uses a recall potion if one is available
 * @returns true if successful, false if unsuccessful
 */
export async function transitionToMainland(
  character: Character,
): Promise<boolean> {
  if (character.checkQuantityOfItemInInv(RecallPotion) > 0) {
    logger.info(
      `Using a Recall Potion to travel from Sandwhisper Isle to Mainland`,
    );
    await character.useItem(RecallPotion, 1);
    return true;
  }

  if (character.checkQuantityOfItemInInv(ForestBankPotion) > 0) {
    logger.info(
      `Using a Forest Bank Potion to travel from Sandwhisper Isle to Mainland`,
    );
    await character.useItem(ForestBankPotion, 1);
    return true;
  }

  logger.info(`No return potion available. Transitioning via boat`);
  const transitionPoint = character.transitionLocations.find(
    (t) =>
      t.layer === MapLayer.overworld &&
      t.y >= SANDWHISPER_Y_BOUNDARY &&
      t.interactions.transition?.layer === MapLayer.overworld &&
      t.interactions.transition.y < SANDWHISPER_Y_BOUNDARY,
  );
  if (!transitionPoint) {
    logger.error(
      'Could not find Sandwhisper Isle -> mainland transition point',
    );
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}

/**
 * @description Move to the Overworld -> Underground Mine transition point and transition.
 * Picks the mainland overworld->underground transition closest to the character.
 * @param character Character object holding the needed functions
 * @returns true if successful, false if not
 */
export async function transitionToUndergroundMine(character: Character) {
  logger.info(`Moving from Overworld -> Underground Mine`);

  const candidates = character.transitionLocations.filter(
    (t) =>
      t.layer === MapLayer.overworld &&
      t.y < SANDWHISPER_Y_BOUNDARY &&
      t.interactions.transition?.layer === MapLayer.underground,
  );
  const transitionPoint = candidates.reduce(
    (best, curr) =>
      Math.abs(curr.x - character.data.x) +
        Math.abs(curr.y - character.data.y) <
      Math.abs(best.x - character.data.x) + Math.abs(best.y - character.data.y)
        ? curr
        : best,
    candidates[0],
  );

  if (!transitionPoint) {
    logger.error('Could not find Overworld -> Underground transition point');
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}

/**
 * @description Move to the Underground Mine -> Overworld transition point and transition
 * @param character Character object holding the needed functions
 * @returns true if successful, false if not
 */
export async function transitionToOverworld(character: Character) {
  logger.info(`Moving from Underground Mine -> Overworld`);

  const transitionPoint = character.transitionLocations.find(
    (t) =>
      t.layer === MapLayer.underground &&
      t.interactions.transition?.layer === MapLayer.overworld &&
      t.interactions.transition.y < SANDWHISPER_Y_BOUNDARY,
  );
  if (!transitionPoint) {
    logger.error('Could not find Underground -> Overworld transition point');
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}

/**
 * @description Move to the Sandwhisper Isle -> Sandwhisper Mine transition point
 * Assumes the char is on Sandwhisper Isle
 * @returns true if successful, false if not
 */
export async function transitionToSandwhisperMine(character: Character) {
  logger.info(`Moving from Sandwhisper Isle -> Sandwhisper Mine`);

  const transitionPoint = character.transitionLocations.find(
    (t) =>
      t.layer === MapLayer.overworld &&
      t.y >= SANDWHISPER_Y_BOUNDARY &&
      t.interactions.transition?.layer === MapLayer.underground,
  );
  if (!transitionPoint) {
    logger.error(
      'Could not find Sandwhisper Isle -> Sandwhisper Mine transition point',
    );
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}

/**
 * @description Move to the Sandwhisper Mine -> Sandwhisper Isle transition point
 * Assumes the char is in Sandwhisper Mine
 * @returns true if successful, false if not
 */
export async function transitionFromSandwhisperMine(character: Character) {
  logger.info(`Moving from Sandwhisper Mine -> Sandwhisper Isle`);

  const transitionPoint = character.transitionLocations.find(
    (t) =>
      t.layer === MapLayer.underground &&
      t.interactions.transition?.layer === MapLayer.overworld &&
      t.interactions.transition.y >= SANDWHISPER_Y_BOUNDARY,
  );
  if (!transitionPoint) {
    logger.error(
      'Could not find Sandwhisper Mine -> Sandwhisper Isle transition point',
    );
    return false;
  }

  if (!(await character.move(transitionPoint))) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}
