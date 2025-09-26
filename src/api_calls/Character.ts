import { ApiError } from '../classes/Error.js';
import { CharacterSchema } from '../types/types.js';
import { ApiUrl, MyHeaders } from '../utils.js';

/**
 * @description returns the character information
 * @param characterName
 * @returns {CharacterSchema}
 */
export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema | ApiError> {
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

    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Failed to get character data: ${response.statusText}`,
      });
    }

    if (!data.data) {
      throw new ApiError({
        code: 500,
        message: 'Character API response missing data field',
      });
    }

    return data.data;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    return error as ApiError;
  }
}
