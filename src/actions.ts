import { Character } from "./types/CharacterData";
import { getContentLocation } from "./api_calls/Map";
import { logger, sleep } from "./utils";
import { moveCharacter } from "./api_calls/Character";
import { depositItems } from "./api_calls/Bank";
import { SimpleItem } from "./types/ItemData";
import { BankItemTransaction } from "./types/BankData";

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
