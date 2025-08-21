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
// import { CharacterSchema } from '../types/types';
// import { ApiError } from '../classes/ErrorClass';

// export async function beMiner() {
//   let character: CharacterSchema = await getCharacter(CharName);

//   // ToDo: Check the cooldown timer to see if we're currently in a cooldown period. If yes, wait it out

//   character = await evaluateDepositItemsInBank(character);

//   // ToDo: Gathering roles can all use the same flow and have logic to choose which resource to find
//   const miningTypes = await getResourceInformation({
//     query: {
//       skill: 'mining',
//       max_level: character.mining_level,
//     },
//     url: '/resources',
//   });

//   const miningLocations = await getMaps(
//     miningTypes.data[miningTypes.data.length - 1].code,
//     'resource',
//   );

//   const latestLocation = await getCharacterLocation(character.name);

//   let cooldown = cooldownStatus(character);
//   if (cooldown.inCooldown) {
//     await sleep(cooldown.timeRemaining);
//   }

//   if (
//     latestLocation.x === miningLocations.data[0].x &&
//     latestLocation.y === miningLocations.data[0].y
//   ) {
//     logger.info(
//       `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
//     );
//   } else {
//     logger.info(
//       `Moving to x: ${miningLocations.data[0].x}, y: ${miningLocations.data[0].y}`,
//     );

//     const moveResponse = await actionMove(
//       character.name,
//       miningLocations.data[0].x,
//       miningLocations.data[0].y,
//     );

//     // Check if the response is an error
//     if (moveResponse instanceof ApiError) {
//       logger.error(
//         `Failed to move character: ${moveResponse.error.message} (Code: ${moveResponse.error.code})`,
//       );

//       // Handle specific error codes
//       if (moveResponse.error.code === 452) {
//         logger.error(
//           'Token is missing or empty. Please check your authentication.',
//         );
//         // You might want to retry with a fresh token or exit the function
//         return;
//       }

//       // For other errors, you might want to retry or handle differently
//       logger.error('Move operation failed, skipping this iteration');
//       return;
//     }

//     // If we get here, the move was successful
//     character = moveResponse.data.character;
//     await sleep(moveResponse.data.cooldown.remaining_seconds);
//   }

//   logger.info(`Gathering resources at x: ${character.x}, y: ${character.y}`);
//   const gatherResponse = await gatherResources(character.name);
//   character = gatherResponse.data.character;
//   await sleep(gatherResponse.data.cooldown.remaining_seconds || 10);
// }
