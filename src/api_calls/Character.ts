import { CharacterSchema } from '../types/types';
import { ApiUrl, MyHeaders, logger } from '../utils';

/**
 * @description returns the character information
 * @param characterName
 * @returns {CharacterSchema}
 */
export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema> {
  const requestOptions = {
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
