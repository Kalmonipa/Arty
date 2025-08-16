import { Character, HealthStatus } from "./types/CharacterData";
import { getContentLocation } from "./api_calls/Map";
import { logger, sleep } from "./utils";
import { moveCharacter } from "./api_calls/Character";
import { depositItems } from "./api_calls/Bank";
import { SimpleItem } from "./types/ItemData";
import { BankItemTransaction } from "./types/BankData";
import { ErrorResponse } from "./types/ResponseData";
import { checkErrorCodes } from "./api_calls/ErrorHandling";

/**
 * Returns the percentage of health we have and what is needed to get to 100%
 * @param character
 */
export function checkHealth(character: Character): HealthStatus {
  return {
    percentage: (character.hp / character.max_hp) * 100,
    difference: character.max_hp - character.hp,
  };
}

/**
 * Checks if the character is in cooldown. Sleep until if finishes if yes
 * @param character
 * @returns {boolean}
 */
export function cooldownStatus(character: Character): {
  inCooldown: boolean;
  timeRemaining: number;
} {
  const timestamp = character.cooldown_expiration;

  const targetDate = new Date(timestamp);

  const now = new Date();

  if (now > targetDate) {
    return { inCooldown: false, timeRemaining: 0 };
  } else {
    logger.info(`Cooldown is still ongoing. Waiting for ${Math.floor((targetDate.getTime() - now.getTime()) / 1000)} ${timestamp}`);
    return {
      inCooldown: true,
      timeRemaining: Math.floor((targetDate.getTime() - now.getTime()) / 1000),
    };
  }
}

export async function findClosestBankAndDepositItems(
  character: Character,
): Promise<BankItemTransaction> {
  // ToDo: Implement a function to find the closest map.
  // Currently we just go to the first one
  const bankLocations = (await getContentLocation("bank")).data;
  logger.info(
    `Found bank at x: ${bankLocations[0].x}, y: ${bankLocations[0].y}`,
  );

  if (
    character.x === bankLocations[0].x &&
    character.y === bankLocations[0].y
  ) {
    logger.info(
      `Already at location x: ${character.x}, y: ${character.y}`,
    );
  } else {
    logger.info(`Moving to x: ${bankLocations[0].x}, y: ${bankLocations[0].y}`);
    const moveResponse = await moveCharacter(
      character.name,
      bankLocations[0].x,
      bankLocations[0].y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  var itemsToDeposit: SimpleItem[] = [];

  //logger.info(character.inventory);

  for (var i = 0; i < character.inventory.length; i++) {
    // logger.info(
    //   `${character.inventory[i].code}: ${character.inventory[i].quantity}`,
    // );
    if (character.inventory[i].code !== "") {
      itemsToDeposit.push({
        code: character.inventory[i].code,
        quantity: character.inventory[i].quantity,
      });
    }
  }

  try {
    const depositResponse = await depositItems(character.name, itemsToDeposit);
    return depositResponse;
  } catch (error) {
    logger.error(`Deposit failed: ${error}`);
  }
}

/**
 * Returns what percentage of the backpack is full
 * @param char Character info to parse
 */
export function getInventorySpace(char: Character): number {
  var usedSpace = 0;
  char.inventory.forEach((invSlot) => {
    usedSpace += invSlot.quantity;
  });

  return (usedSpace / char.inventory_max_items) * 100;
}
