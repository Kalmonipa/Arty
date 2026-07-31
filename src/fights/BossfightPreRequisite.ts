import { requestLoadout } from '../api_calls/Account.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../character/apiCalls.js';
import { Character } from '../character/characterClass.js';
import { BouncyBella, JumpyJimmy } from '../constants.js';
import { ApiError } from '../core/Error.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { logger } from '../utils.js';

export async function simulateBossFight(
  character: Character,
  target: ObjectiveTargets,
) {
  const mobInfo = await getMonsterInformation(target.code);
  if (mobInfo instanceof ApiError) {
    return character.handleErrors(mobInfo);
  }

  const participants = await findBestParticipants();
  if (!participants) {
    logger.warn(`No participants found for fight against ${target.code}`);
    return false;
  }

  // Build FakeCharacterSchemas to run a fight sim
  const leaderFakeCharSchema = character.createFakeCharacterSchema(
    character.data,
  );
  let part1FakeCharSchema: FakeCharacterSchema;
  let part2FakeCharSchema: FakeCharacterSchema;

  let part1FakeCharSchemaRequest = await requestLoadout(
    participants[0].name,
    mobInfo.data.code,
  );
  if (part1FakeCharSchemaRequest instanceof ApiError) {
    logger.warn(
      `Failed to get loadout for ${participants[0].name}: ${part1FakeCharSchemaRequest.error.message}. Building my own`,
    );
    part1FakeCharSchema = character.createFakeCharacterSchema(participants[0]);
  } else {
    logger.info(`Successfully received loadout from ${participants[0].name}`);
    part1FakeCharSchema = part1FakeCharSchemaRequest.proposedLoadout;
  }
  const part2FakeCharSchemaRequest = await requestLoadout(
    participants[1].name,
    mobInfo.data.code,
  );
  if (part2FakeCharSchemaRequest instanceof ApiError) {
    logger.warn(
      `Failed to get loadout for ${participants[1].name}: ${part2FakeCharSchemaRequest.error.message}. Building my own`,
    );
    part2FakeCharSchema = character.createFakeCharacterSchema(participants[1]);
  } else {
    logger.info(`Successfully received loadout from ${participants[1].name}`);
    part2FakeCharSchema = part2FakeCharSchemaRequest.proposedLoadout;
  }

  const simResult = await character.simulateFightNow(
    [leaderFakeCharSchema, part1FakeCharSchema, part2FakeCharSchema],
    target.code,
  );

  logger.info(`Sim result was a ${simResult ? 'win' : 'loss'}`);
}

/**
 * @description Gets the character schemas for JumpyJimmy and BouncyBella. Hardcoded for now
 * @todo Expand this to choose the supporting participants dynamically
 * @returns An array of the character schemas of the 2 participants
 */
async function findBestParticipants(): Promise<CharacterSchema[]> {
  let part1: CharacterSchema;
  let part2: CharacterSchema;

  const allChars = await getMyCharacters();
  if (allChars instanceof ApiError) {
    await this.character.handleErrors(allChars);
    return [];
  }

  return [
    allChars.find((char) => char.name === BouncyBella),
    allChars.find((char) => char.name === JumpyJimmy),
  ];

  // for (const char of allChars) {
  //   if (part1 === undefined) {
  //     part1 = char;
  //   } else if (part2 === undefined) {
  //     part2 = char;
  //   }

  //   if (char.level > part1.level) {
  //     logger.info(
  //       `${char.name} [${char.level}] is higher level than ${part1.name} [${part1.level}]`,
  //     );
  //     part1 = char;
  //   } else if (char.level > part2.level) {
  //     logger.info(
  //       `${char.name} [${char.level}] is higher level than ${part2.name} [${part2.level}]`,
  //     );
  //     part2 = char;
  //   }
  // }

  //return [part1, part2];
}
