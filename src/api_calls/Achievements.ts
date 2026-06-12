import { ApiUrl } from '../constants.js';
import { ApiError, toApiError } from '../core/Error.js';
import {
  AchievementResponseSchema,
  DataPageAccountAchievementSchema,
  StaticDataPageAchievementSchema,
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
): Promise<StaticDataPageAchievementSchema[] | ApiError> {
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
    return toApiError(error);
  }
}

/**
 * @description Returns completed achievements for an account, one page at a time
 */
export async function getAccountAchievements(
  account: string,
  page: number = 1,
  size: number = 100,
): Promise<DataPageAccountAchievementSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/accounts/${account}/achievements`);
  apiUrl.searchParams.set('completed', 'true');
  apiUrl.searchParams.set('page', page.toString());
  apiUrl.searchParams.set('size', size.toString());

  try {
    const response = await fetch(apiUrl, getRequestOptions);
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = `Account ${account} not found.`;
          break;
        default:
          message = `Unknown error from /accounts/${account}/achievements`;
          break;
      }
      throw new ApiError({ code: response.status, message });
    }
    return await response.json();
  } catch (error) {
    return toApiError(error);
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
