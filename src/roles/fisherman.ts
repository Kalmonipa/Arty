import { CharName } from '../constants';
import {
  craftItem,
  getCharacter,
  getCharacterLocation,
  actionMove,
} from '../api_calls/Character';
import { getMaps } from '../api_calls/Maps';
import {
  getResourceInformation,
  gatherResources,
} from '../api_calls/Resources';
import { logger, sleep } from '../utils';
import {
  cooldownStatus,
  findBankAndDepositItems,
  evaluateCraftingWithCurrentInventory,
  getInventoryFullness,
  evaluateClosestMap,
} from '../actions';
import { CharacterSchema } from '../types/types';

export async function beFisherman() {
  let character: CharacterSchema = await getCharacter(CharName);
  let shouldCraft: boolean = false;

  let usedInventorySpace = getInventoryFullness(character);
  if (usedInventorySpace >= 90) {
    logger.info(`Inventory is ${usedInventorySpace}% full`);
    shouldCraft = true;

    const itemsToCraft = await evaluateCraftingWithCurrentInventory(
      character,
      character.fishing_level,
      'cooking',
    );

    if (itemsToCraft.length === 0) {
      logger.info('No items to craft');
    } else {
      const cookingLocations = await getMaps('cooking', 'workshop');

      const closestCookingSpot = evaluateClosestMap(
        character,
        cookingLocations.data,
      );

      const latestLocation = await getCharacterLocation(character.name);

      if (
        latestLocation.x === closestCookingSpot.x &&
        latestLocation.y === closestCookingSpot.y
      ) {
        logger.info(
          `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
        );
      } else {
        logger.info(
          `Moving to x: ${closestCookingSpot.x}, y: ${closestCookingSpot.y}`,
        );

        const moveResponse = await actionMove(
          character.name,
          closestCookingSpot.x,
          closestCookingSpot.y,
        );
        character = moveResponse.data.character;
        await sleep(moveResponse.data.cooldown.remaining_seconds);
      }

      for (var i = 0; i < itemsToCraft.length; i++) {
        const craftResponse = await craftItem(character, {
          body: itemsToCraft[i],
          path: { name: character.name },
          url: '/my/{name}/action/crafting',
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
      skill: 'fishing',
      max_level: character.fishing_level,
    },
    url: '/resources',
  });

  const fishingLocations = await getMaps(
    fishingTypes.data[fishingTypes.data.length - 1].code,
    'resource',
  );

  const closestFishingSpot = evaluateClosestMap(
    character,
    fishingLocations.data,
  );

  const latestLocation = await getCharacterLocation(character.name);

  let cooldown = cooldownStatus(character);
  if (cooldown.inCooldown) {
    await sleep(cooldown.timeRemaining);
  }

  if (
    latestLocation.x === closestFishingSpot.x &&
    latestLocation.y === closestFishingSpot.y
  ) {
    logger.info(
      `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
    );
  } else {
    logger.info(
      `Moving to x: ${closestFishingSpot.x}, y: ${closestFishingSpot.y}`,
    );

    const moveResponse = await actionMove(
      character.name,
      closestFishingSpot.x,
      closestFishingSpot.y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  logger.info(`Gathering resources at x: ${character.x}, y: ${character.y}`);
  const gatherResponse = await gatherResources(character.name);
  character = gatherResponse.data.character;
  await sleep(gatherResponse.data.cooldown.remaining_seconds || 10);
}
