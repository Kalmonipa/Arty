import { CharName } from "./constants";
import {
  getCharacter,
  getCharacterLocation,
  getInventorySpace,
  moveCharacter,
} from "./api_calls/Character";
import { getContentLocation } from "./api_calls/Map";
import { Character } from "./types/CharacterData";
import { getResourceLocations, gatherResources } from "./api_calls/Resources";
import { ResourceQueryParameters } from "./types/ResourceData";
import { logger, sleep } from "./utils";
import { findClosestBankAndDepositItems } from "./actions";

let shouldStopActions = false;

async function main() {
  while (!shouldStopActions) {
    let character: Character = await getCharacter(CharName);

    // ToDo: Check the cooldown timer to see if we're currently in a cooldown period. If yes, wait it out

    let usedInventorySpace = getInventorySpace(character);
    // ToDo: Remove the hardcoded 90 and use a percentage of available inventory space
    if (usedInventorySpace >= 90) {
      logger.warn(`Inventory is almost full. Depositing items`);
      const depositResponse = await findClosestBankAndDepositItems(character);
      character = depositResponse.character;
      sleep(depositResponse.cooldown.remaining_seconds);
      //shouldStopActions = true;
    } else {
      logger.info(`Used inventory slots: ${usedInventorySpace}`);
    }

    const queryParams: ResourceQueryParameters = {
      skill: "fishing",
      max_level: character.fishing_level,
    };

    const fishingTypes = await getResourceLocations(queryParams);

    const fishingLocations = await getContentLocation(
      fishingTypes.data[fishingTypes.data.length - 1].code,
      "resource",
    );

    const latestLocation = await getCharacterLocation(character.name);

    if (
      latestLocation.x === fishingLocations.data[0].x &&
      latestLocation.y === fishingLocations.data[0].y
    ) {
      logger.info(
        `We're already at the location x: ${latestLocation.x}, y: ${latestLocation.y}`,
      );
    } else {
      logger.info(
        `Moving to x: ${fishingLocations.data[0].x}, y: ${fishingLocations.data[0].y}`,
      );
      const moveResponse = await moveCharacter(
        character.name,
        fishingLocations.data[0].x,
        fishingLocations.data[0].y,
      );
      character = moveResponse.data.character;
      await sleep(moveResponse.data.cooldown.remaining_seconds);
    }

    logger.info(`Gathering resources at x: ${character.x}, y: ${character.y}`);
    const gatherResponse = await gatherResources(CharName);
    character = gatherResponse.data.character;
    await sleep(gatherResponse.data.cooldown.remaining_seconds);
  }

  logger.error("Reached end of activities. Exiting");
  process.exit();
}

main();
