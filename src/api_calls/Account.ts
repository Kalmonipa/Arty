import { JobResponse } from '../types/CharacterData.js';
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
