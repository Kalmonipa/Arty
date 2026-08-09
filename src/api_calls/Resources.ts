import { ApiError } from '../core/Error.js';
import {
  StaticDataPageResourceSchema,
  GetAllResourcesResourcesGetParams,
  ResourceResponseSchema,
  ResourceSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * Resource data is static, so it is cached by code for the process lifetime.
 * Warmed in bulk by getAllResourceInformation and read by getResourceInformation
 * to avoid per-resource API calls.
 */
const resourceCache = new Map<string, ResourceResponseSchema>();

/**
 * The whole resource table, warmed on the first drop lookup. It is a couple of
 * dozen rows, so answering "what drops X" in memory beats a request per item.
 */
let everyResource: ResourceSchema[] | undefined;

/** Test seam: drop the cached resources so each test starts from a clean fetch. */
export function clearResourceCache(): void {
  resourceCache.clear();
  everyResource = undefined;
}

/**
 * Every node that drops the given item. Static data, so the table is fetched
 * once per process and filtered locally on every call after that.
 */
export async function getResourceNodesDropping(
  code: string,
): Promise<ResourceSchema[] | ApiError> {
  if (everyResource === undefined) {
    const all: ResourceSchema[] = [];
    let page = 1;

    for (;;) {
      const res = await getAllResourceInformation({ page, size: 100 });
      if (res instanceof ApiError) {
        return res;
      }

      all.push(...res.data);
      if (page >= res.pages) {
        break;
      }
      page += 1;
    }

    everyResource = all;
  }

  return everyResource.filter((resource) =>
    resource.drops.some((drop) => drop.code === code),
  );
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
