import { ApiUrl } from '../constants.js';
import { ApiError } from '../core/Error.js';
import {
  AchievementResponseSchema,
  DataPageAchievementSchema,
  GetAllAchievementsAchievementsGetParams,
} from '../types/types.js';
import { getRequestOptions } from '../utils.js';

/**
 * @description returns all available achievements
 * @param page Page number
 * @param size Page size
 * @param type Type of achievements.
 * @returns {JobResponse}
 */
export async function getAllAchievements(
  params?: GetAllAchievementsAchievementsGetParams,
): Promise<DataPageAchievementSchema[] | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/achievements`);

  if (params.type) {
    apiUrl.searchParams.set('type', params.type);
  }
  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }

  try {
    const response = await fetch(apiUrl, getRequestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /achievements`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}

/**
 * @description Gets data on a specific achievement
 * @param code Code of the achievement
 * @returns {AchievementResponseSchema}
 */
export async function getAchievement(
  code: string,
): Promise<AchievementResponseSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/achievements/${code}`);

  try {
    const response = await fetch(apiUrl, getRequestOptions);
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = `Achievement ${code} not found.`;
          break;
        default:
          message = `Unknown error from /achievements/${code}`;
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }
    return await response.json();
  } catch (error) {
    return error;
  }
}
