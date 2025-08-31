// import { CharName } from '../constants';
// import {
//   getCharacter,
//   getCharacterLocation,
//   actionMove,
// } from '../api_calls/Character';
// import { getMaps } from '../api_calls/Maps';
// import {
//   getResourceInformation,
//   gatherResources,
// } from '../api_calls/Resources';
// import { logger, sleep } from '../utils';
// import { cooldownStatus, evaluateDepositItemsInBank } from '../actions';
// import { CharacterSchema, DataPageMapSchema } from '../types/types';

// export async function beLumberjack(objective?: {
//   content_code: string;
//   quantity: number;
// }) {
//   let character: CharacterSchema = await getCharacter(CharName);

//   // Check the cooldown timer to see if we're currently in a cooldown period. If yes, wait it out

//   character = await evaluateDepositItemsInBank(character);

//   // Gathering roles can all use the same flow and have logic to choose which resource to find
//   const woodcuttingTypes = await getResourceInformation({
//     query: {
//       skill: 'woodcutting',
//       max_level: character.woodcutting_level,
//     },
//     url: '/resources',
//   });

//   var treeLocations: DataPageMapSchema;
//   if (objective) {
//     treeLocations = await getMaps(objective.content_code, 'resource');
//   } else {
//     treeLocations = await getMaps(
//       woodcuttingTypes.data[woodcuttingTypes.data.length - 1].code,
//       'resource',
//     );
//   }

//   const latestLocation = await getCharacterLocation(character.name);

//   let cooldown = cooldownStatus(character);
//   if (cooldown.inCooldown) {
//     await sleep(cooldown.timeRemaining);
//   }

//   if (
//     latestLocation.x === treeLocations.data[0].x &&
//     latestLocation.y === treeLocations.data[0].y
//   ) {
//     logger.info(
//       `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
//     );
//   } else {
//     logger.info(
//       `Moving to x: ${treeLocations.data[0].x}, y: ${treeLocations.data[0].y}`,
//     );

//     const moveResponse = await actionMove(
//       character.name,
//       treeLocations.data[0].x,
//       treeLocations.data[0].y,
//     );
//     character = moveResponse.data.character;
//     await sleep(moveResponse.data.cooldown.remaining_seconds);
//   }

//   logger.info(`Gathering resources at x: ${character.x}, y: ${character.y}`);
//   const gatherResponse = await gatherResources(character.name);
//   character = gatherResponse.data.character;
//   await sleep(gatherResponse.data.cooldown.remaining_seconds || 10);
// }
