import { CharName } from '../constants';
import { getCharacter, getCharacterLocation } from '../api_calls/Character';
import { getMaps } from '../api_calls/Maps';
import { getResourceInformation } from '../api_calls/Resources';
import { logger, sleep } from '../utils';
import { cooldownStatus, evaluateDepositItemsInBank } from '../actions';
import { CharacterSchema } from '../types/types';

export async function beAlchemist() {
  let character: CharacterSchema = await getCharacter(CharName);

  character = await evaluateDepositItemsInBank(character);

  // ToDo: Gathering roles can all use the same flow and have logic to choose which resource to find
  const alchemicalTypes = await getResourceInformation({
    query: {
      skill: 'alchemy',
      max_level: character.alchemy_level,
    },
    url: '/resources',
  });

  const alchemicalLocations = await getMaps(
    alchemicalTypes.data[alchemicalTypes.data.length - 1].code,
    'resource',
  );

  const latestLocation = await getCharacterLocation(character.name);

  let cooldown = cooldownStatus(character);
  if (cooldown.inCooldown) {
    await sleep(cooldown.timeRemaining);
  }

  if (
    latestLocation.x === alchemicalLocations.data[0].x &&
    latestLocation.y === alchemicalLocations.data[0].y
  ) {
    logger.info(
      `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
    );
  } else {
    logger.info(
      `Moving to x: ${alchemicalLocations.data[0].x}, y: ${alchemicalLocations.data[0].y}`,
    );

    const moveResponse = await actionMove(
      character.name,
      alchemicalLocations.data[0].x,
      alchemicalLocations.data[0].y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  logger.info(`Gathering resources at x: ${character.x}, y: ${character.y}`);
  const gatherResponse = await gatherResources(character.name);
  character = gatherResponse.data.character;
  await sleep(gatherResponse.data.cooldown.remaining_seconds || 10);
}
