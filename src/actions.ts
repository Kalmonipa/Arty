import { Character, HealthStatus } from "./types/CharacterData";
import { getContentLocation } from "./api_calls/Map";
import { logger, sleep } from "./utils";
import { moveCharacter } from "./api_calls/Character";
import { depositItems } from "./api_calls/Bank";
import { SimpleItem } from "./types/ItemData";
import { BankItemTransaction } from "./types/BankData";

/**
 * Returns the percentage of health we have and what is needed to get to 100%
 * @param character 
 */
export function checkHealth(character: Character): HealthStatus {
  return {percentage: (character.hp / character.max_hp) * 100, difference: character.max_hp - character.hp}
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
      `We're already at the location x: ${character.x}, y: ${character.y}`,
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

  return await depositItems(character.name, itemsToDeposit);
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
