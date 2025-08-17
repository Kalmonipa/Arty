import { CharName } from "../constants";
import {
  getCharacter,
  getCharacterLocation,
  moveCharacter,
} from "../api_calls/Character";
import { getContentLocation } from "../api_calls/Map";
import {
  getResourceInformation,
  gatherResources,
} from "../api_calls/Resources";
import { logger, sleep } from "../utils";
import { cooldownStatus, evaluateDepositItemsInBank } from "../actions";
import { CharacterSchema } from "../types/types";

export async function beFisherman() {
  let character: CharacterSchema = await getCharacter(CharName);

  // ToDo: Check the cooldown timer to see if we're currently in a cooldown period. If yes, wait it out

  character = await evaluateDepositItemsInBank(character);

  const fishingTypes = await getResourceInformation({
    query: {
      skill: "fishing",
      max_level: character.fishing_level,
    },
    url: "/resources",
  });

  const fishingLocations = await getContentLocation(
    fishingTypes.data[fishingTypes.data.length - 1].code,
    "resource",
  );

  const latestLocation = await getCharacterLocation(character.name);

  let cooldown = cooldownStatus(character);
  if (cooldown.inCooldown) {
    await sleep(cooldown.timeRemaining);
  }

  if (
    latestLocation.x === fishingLocations.data[0].x &&
    latestLocation.y === fishingLocations.data[0].y
  ) {
    logger.info(
      `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
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
  const gatherResponse = await gatherResources(character.name);
  character = gatherResponse.data.character;
  await sleep(gatherResponse.data.cooldown.remaining_seconds || 10);
}
