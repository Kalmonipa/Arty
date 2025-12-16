import { RecallPotion } from '../names.js';
import { logger } from '../utils.js';
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
  const recallPotsInBank =
    await character.checkQuantityOfItemInBank(RecallPotion);

  // If no recall pots in bank withdraw 2k gold to pay for transition there and back
  if (recallPotsInBank === 0) {
    logger.info(`Withdrawing 2000 gold before travelling to Sandwhisper`);
    await character.withdrawNow(2000, 'gold');
  } else if (
    // Otherwise withdraw a recall pot and 1k gold
    recallPotsInInv === 0 &&
    recallPotsInBank > 0
  ) {
    await character.withdrawNow(1, RecallPotion);
    character.addItemToItemsToKeep(RecallPotion);
    await character.withdrawNow(1000, 'gold');
  } else if (recallPotsInInv > 0) {
    // Otherwise we have a recall pot in inv so just withdraw 1k gold
    await character.withdrawNow(1000, 'gold');
  }

  // ToDo: Don't hardcode the transition map ID
  if (
    !(await character.move(
      character.transitionLocations.find(
        (mapSchema) => mapSchema.map_id === 1093,
      ),
    ))
  ) {
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
  } else {
    logger.info(`No recall potion available. Transitioning via boat`);
    // ToDo: Don't hardcode the transition map ID
    if (
      !(await character.move(
        character.transitionLocations.find(
          (mapSchema) => mapSchema.map_id === 1336,
        ),
      ))
    ) {
      return false;
    }
    if (!(await character.transition())) {
      return false;
    }
  }
  return true;
}

/**
 * @description Move to the Overworld -> Underground Mine transition point and transition
 * @param character Character object holding the needed functions
 * @returns true if successful, false if not
 */
export async function transitionToUndergroundMine(character: Character) {
  if (
    !(await character.move(
      character.transitionLocations.find(
        (mapSchema) => mapSchema.map_id === 571,
      ),
    ))
  ) {
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
  if (
    !(await character.move(
      character.transitionLocations.find(
        (mapSchema) => mapSchema.map_id === 572,
      ),
    ))
  ) {
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
  if (
    !(await character.move(
      character.transitionLocations.find(
        (mapSchema) => mapSchema.map_id === 1177,
      ),
    ))
  ) {
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
  if (
    !(await character.move(
      character.transitionLocations.find(
        (mapSchema) => mapSchema.map_id === 1178,
      ),
    ))
  ) {
    return false;
  }
  if (!(await character.transition())) {
    return false;
  }
  return true;
}
