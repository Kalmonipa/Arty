import { ApiError } from '../core/Error.js';
import { CharacterSchema } from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * @description returns the character information
 * @param characterName
 * @returns {CharacterSchema}
 */
export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema | ApiError> {
  const res = await apiRequest<{ data: CharacterSchema }>({
    url: `${ApiUrl}/characters/${characterName}`,
    fallbackMessage: 'Failed to get character data',
  });

  if (res instanceof ApiError) {
    return res;
  }

  if (!res.data) {
    return new ApiError({
      code: 500,
      message: 'Character API response missing data field',
    });
  }

  return res.data;
}

/**
 * @description returns all characters in the account
 * @param characterName
 * @returns {CharacterSchema[]}
 */
export async function getMyCharacters(): Promise<CharacterSchema[] | ApiError> {
  const res = await apiRequest<{ data: CharacterSchema[] }>({
    url: `${ApiUrl}/my/characters`,
    fallbackMessage: 'Failed to get character data',
  });

  if (res instanceof ApiError) {
    return res;
  }

  if (!res.data) {
    return new ApiError({
      code: 500,
      message: 'Character API response missing data field',
    });
  }

  return res.data;
}
