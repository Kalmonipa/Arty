import { ApiError } from '../core/Error.js';
import { CraftResponse, JobResponse } from '../types/CharacterData.js';
import { SimpleItemSchema } from '../types/types.js';
import { logger } from '../utils.js';

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
      `http://${charName.toLowerCase}:3000/jobs/pause`,
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
      `http://${charName.toLowerCase}:3000/jobs/resume`,
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
  };

  try {
    logger.info(
      `Trying POST http://${charName.toLowerCase}:3000/craft with ${target.quantity} ${target.code}`,
    );

    const response = await fetch(
      `http://${charName.toLowerCase}:3000/craft`,
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
