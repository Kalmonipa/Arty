import { ApiError } from '../core/Error.js';
import {
  StaticDataPageMonsterSchema,
  GetAllMonstersMonstersGetParams,
  MonsterResponseSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * Monster data is static, so once fetched it is cached by code for the lifetime
 * of the process. Warmed in bulk by getAllMonsterInformation (Character.init
 * loads the full monster list) and read by getMonsterInformation to avoid
 * per-monster API calls during combat gear/loadout evaluation.
 */
const monsterCache = new Map<string, MonsterResponseSchema>();

/** Test seam: drop the cached monsters so each test starts from a clean fetch. */
export function clearMonsterCache(): void {
  monsterCache.clear();
}

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

  const res = await apiRequest<StaticDataPageMonsterSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /monsters`,
  });

  if (!(res instanceof ApiError)) {
    for (const monster of res.data) {
      monsterCache.set(monster.code, { data: monster });
    }
  }

  return res;
}

export async function getMonsterInformation(
  monsterCode: string,
): Promise<MonsterResponseSchema | ApiError> {
  const cached = monsterCache.get(monsterCode);
  if (cached) {
    return cached;
  }

  const apiUrl = new URL(`${ApiUrl}/monsters/${monsterCode}`);

  const res = await apiRequest<MonsterResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: `Monster not found: ${monsterCode}`,
    },
    fallbackMessage: `Unknown error from /monsters`,
  });

  if (res instanceof ApiError) {
    return res;
  }

  monsterCache.set(monsterCode, res);
  return res;
}
