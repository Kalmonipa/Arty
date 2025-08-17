import { CharName } from "../constants";
import {
  craftItem,
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
import {
  cooldownStatus,
  findBankAndDepositItems,
  evaluateCraftingWithCurrentInventory,
  getInventoryFullness,
} from "../actions";
import { CharacterSchema } from "../types/types";

export async function beFisherman() {
  let character: CharacterSchema = await getCharacter(CharName);
  let shouldCraft: boolean = false;

  // ToDo: Check the cooldown timer to see if we're currently in a cooldown period. If yes, wait it out

  let usedInventorySpace = getInventoryFullness(character);
  if (usedInventorySpace >= 90) {
    logger.info(`Inventory is ${usedInventorySpace}% full`);
    shouldCraft = true;

    const itemsToCraft = await evaluateCraftingWithCurrentInventory(
      character,
      character.fishing_level,
      "cooking",
    );

    if (itemsToCraft.length === 0) {
      logger.info("No items to craft");
    } else {
      const cookingLocations = await getContentLocation("cooking", "workshop");

      const latestLocation = await getCharacterLocation(character.name);

      if (
        latestLocation.x === cookingLocations.data[0].x &&
        latestLocation.y === cookingLocations.data[0].y
      ) {
        logger.info(
          `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
        );
      } else {
        logger.info(
          `Moving to x: ${cookingLocations.data[0].x}, y: ${cookingLocations.data[0].y}`,
        );

        const moveResponse = await moveCharacter(
          character.name,
          cookingLocations.data[0].x,
          cookingLocations.data[0].y,
        );
        character = moveResponse.data.character;
        await sleep(moveResponse.data.cooldown.remaining_seconds);
      }

      for (var i = 0; i < itemsToCraft.length; i++) {
        const craftResponse = await craftItem(character, {
          body: itemsToCraft[i],
          path: { name: character.name },
          url: "/my/{name}/action/crafting",
        });
        character = craftResponse.data.character;
        await sleep(craftResponse.data.cooldown.remaining_seconds);
      }
    }

    const depositResponse = await findBankAndDepositItems(character);
    character = depositResponse.character;
    await sleep(depositResponse.cooldown.remaining_seconds);
  } else {
    logger.info(
      `Backpack: ${usedInventorySpace}% of ${character.inventory_max_items} slots`,
    );
  }

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
