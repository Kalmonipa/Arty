import { ApiError } from '../core/Error.js';
import {
  StaticDataPageMonsterSchema,
  GetAllMonstersMonstersGetParams,
  MonsterResponseSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

export async function getAllMonsterInformation(
  data: GetAllMonstersMonstersGetParams,
): Promise<StaticDataPageMonsterSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/monsters`);

  if (data.drop) {
    apiUrl.searchParams.set('drop', data.drop);
  }
  if (data.max_level) {
    apiUrl.searchParams.set('max_level', data.max_level.toString());
  }
  if (data.min_level) {
    apiUrl.searchParams.set('min_level', data.min_level.toString());
  }
  if (data.page) {
    apiUrl.searchParams.set('page', data.page.toString());
  }
  if (data.size) {
    apiUrl.searchParams.set('size', data.size.toString());
  }
  if (data.name) {
    apiUrl.searchParams.set('name', data.name);
  }

  return apiRequest<StaticDataPageMonsterSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /monsters`,
  });
}

export async function getMonsterInformation(
  monsterCode: string,
): Promise<MonsterResponseSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/monsters/${monsterCode}`);

  return apiRequest<MonsterResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: `Monster not found: ${monsterCode}`,
    },
    fallbackMessage: `Unknown error from /monsters`,
  });
}
