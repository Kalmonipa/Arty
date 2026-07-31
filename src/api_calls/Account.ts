import { ApiError, toApiError } from '../core/Error.js';
import { ProposeLoadoutResponse } from '../fights/types.js';
import { CraftResponse, JobResponse } from '../types/CharacterData.js';
import { SimpleItemSchema } from '../types/types.js';
import { logger, MyHeaders } from '../utils.js';

/**
 * @description returns all characters in the account
 * @param characterName
 * @returns {JobResponse}
 */
export async function pauseCharacter(charName: string): Promise<JobResponse> {
  const requestOptions = {
    method: 'POST',
  };

  try {
    const response = await fetch(
      `http://${charName.toLowerCase()}:3000/jobs/pause`,
      requestOptions,
    );
    const data = await response.json();

    logger.info(data.message);

    return data;
  } catch (error) {
    return error;
  }
}

/**
 * @description Resumes the current active job
 * @param charName
 * @returns {JobResponse}
 */
export async function resumeCharacter(charName: string): Promise<JobResponse> {
  const requestOptions = {
    method: 'POST',
  };

  try {
    const response = await fetch(
      `http://${charName.toLowerCase()}:3000/jobs/resume`,
      requestOptions,
    );
    const data = await response.json();

    logger.info(data.message);

    return data;
  } catch (error) {
    return error;
  }
}

/**
 * @description Requests another character to craft an item
 * @param charName
 * @param itemID
 */
export async function requestCraftItem(
  charName: string,
  target: SimpleItemSchema,
): Promise<CraftResponse> {
  const requestOptions = {
    method: 'POST',
    body: JSON.stringify({ itemCode: target.code, quantity: target.quantity }),
    MyHeaders,
  };

  try {
    logger.info(
      `Trying POST http://${charName.toLowerCase()}:3000/craft with ${target.quantity} ${target.code}`,
    );

    const response = await fetch(
      `http://${charName.toLowerCase()}:3000/craft`,
      requestOptions,
    );

    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Failed to reach ${charName}`,
      });
    }

    const data = await response.json();

    logger.info(data.message);

    return data;
  } catch (error) {
    return error;
  }
}

/**
 * @description Requests a loadout from the character for a specific target mob
 * @param charName
 * @param targetMob
 */
export async function requestLoadout(
  charName: string,
  targetMob: string,
): Promise<ProposeLoadoutResponse | ApiError> {
  const requestOptions = {
    method: 'GET',
  };

  try {
    const url = `http://${charName.toLowerCase()}:3000/fight/propose-loadout?targetMob=${targetMob}`;

    logger.info(`Trying GET ${url}`);

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Failed to reach ${charName}`,
      });
    }

    const data: ProposeLoadoutResponse | ApiError = await response.json();

    logger.info(data.message);

    return data;
  } catch (error) {
    return toApiError(error);
  }
}
