import { ApiError } from '../core/Error.js';
import {
  StaticDataPageResourceSchema,
  GetAllResourcesResourcesGetParams,
  ResourceResponseSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * Resource data is static, so it is cached by code for the process lifetime.
 * Warmed in bulk by getAllResourceInformation and read by getResourceInformation
 * to avoid per-resource API calls.
 */
const resourceCache = new Map<string, ResourceResponseSchema>();

/** Test seam: drop the cached resources so each test starts from a clean fetch. */
export function clearResourceCache(): void {
  resourceCache.clear();
}

export async function getAllResourceInformation(
  data: GetAllResourcesResourcesGetParams,
): Promise<StaticDataPageResourceSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/resources`);

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
  if (data.skill) {
    apiUrl.searchParams.set('skill', data.skill);
  }

  const res = await apiRequest<StaticDataPageResourceSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /resources`,
  });

  if (!(res instanceof ApiError)) {
    for (const resource of res.data) {
      resourceCache.set(resource.code, { data: resource });
    }
  }

  return res;
}

export async function getResourceInformation(
  itemCode: string,
): Promise<ResourceResponseSchema | ApiError> {
  const cached = resourceCache.get(itemCode);
  if (cached) {
    return cached;
  }

  const apiUrl = new URL(`${ApiUrl}/resources/${itemCode}`);

  const res = await apiRequest<ResourceResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: 'Item not found.',
    },
    fallbackMessage: 'Unknown error from /action/bank/deposit/item',
  });

  if (res instanceof ApiError) {
    return res;
  }

  resourceCache.set(itemCode, res);
  return res;
}
