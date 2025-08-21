import { ApiUrl, MyHeaders } from '../constants';
import { CharacterSchema } from '../types/types';
import { logger } from '../utils';

/**
 * @description returns the character information
 * @param characterName
 * @returns {CharacterSchema}
 */
export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/characters/${characterName}`,
      requestOptions,
    );
    const data = await response.json();
    return data.data;
  } catch (error) {
    logger.error(error);
  }
}

/**
 * @description Gets the latest location of the character
 * @param char
 * @returns {x: number, y: number}
 */
export async function getCharacterLocation(
  char: string,
): Promise<{ x: number; y: number }> {
  const latestInfo = await getCharacter(char);
  logger.debug(`Character location: x: ${latestInfo.x}, y: ${latestInfo.y}`);
  return { x: latestInfo.x, y: latestInfo.y };
}
