import { ApiError } from '../classes/Error.js';
import { CharacterSchema } from '../types/types.js';
import { ApiUrl, MyHeaders, logger } from '../utils.js';

/**
 * @description returns the character information
 * @param characterName
 * @returns {CharacterSchema}
 */
export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema | ApiError> {
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
    return error as ApiError;
  }
}
