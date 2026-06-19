import { ApiUrl } from '../constants.js';
import { ApiError } from '../core/Error.js';
import {
  AchievementResponseSchema,
  DataPageAccountAchievementSchema,
  StaticDataPageAchievementSchema,
  GetAllAchievementsAchievementsGetParams,
  GetAccountAchievementsAccountsAccountAchievementsGetParams,
} from '../types/types.js';
import { apiRequest } from './request.js';

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

  return apiRequest<StaticDataPageAchievementSchema[]>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /achievements`,
  });
}

/**
 * @description Returns completed achievements for an account, one page at a time
 */
export async function getAccountAchievements(
  account: string,
  params?: GetAccountAchievementsAccountsAccountAchievementsGetParams,
): Promise<DataPageAccountAchievementSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/accounts/${account}/achievements`);
  if (params.completed) {
    apiUrl.searchParams.set('completed', String(params.completed));
  }
  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }
  if (params.type) {
    apiUrl.searchParams.set('type', params.type);
  }

  return apiRequest<DataPageAccountAchievementSchema>({
    url: apiUrl,
    errorMessages: {
      404: `Account ${account} not found.`,
    },
    fallbackMessage: `Unknown error from /accounts/${account}/achievements`,
  });
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

  return apiRequest<AchievementResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: `Achievement ${code} not found.`,
    },
    fallbackMessage: `Unknown error from /achievements/${code}`,
  });
}
