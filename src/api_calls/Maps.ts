import { ApiError } from '../core/Error.js';
import {
  GetAllMapsMapsGetParams,
  StaticDataPageMapSchema,
  MapResponseSchema,
  MapSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

export async function getMaps(
  params: GetAllMapsMapsGetParams,
): Promise<StaticDataPageMapSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/maps`);

  if (params.content_code) {
    apiUrl.searchParams.set('content_code', params.content_code);
  }
  if (params.content_type) {
    apiUrl.searchParams.set('content_type', params.content_type);
  }
  if (params.hide_blocked_maps) {
    apiUrl.searchParams.set(
      'hide_blocked_maps',
      String(params.hide_blocked_maps),
    );
  }
  if (params.layer) {
    apiUrl.searchParams.set('layer', params.layer);
  }
  if (params.page) {
    apiUrl.searchParams.set('page', String(params.page));
  }
  if (params.size) {
    apiUrl.searchParams.set('size', String(params.size));
  }

  return apiRequest<StaticDataPageMapSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /maps`,
  });
}

export async function getMapsById(
  mapId: number,
): Promise<MapResponseSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/maps/id/${mapId}`);

  return apiRequest<MapResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: 'Item not found.',
    },
    fallbackMessage: 'Unknown error from /maps/id/:mapId',
  });
}

export async function getAllMaps(
  params: GetAllMapsMapsGetParams,
): Promise<MapSchema[]> {
  let allMaps: MapSchema[] = [];

  const allMapsResponse = await getMaps(params);
  if (allMapsResponse instanceof ApiError) {
    logger.error(`Failed to get all maps`);
    return [];
  }

  allMaps = allMapsResponse.data;

  if (allMapsResponse.pages > 1) {
    for (let pages = 2; pages <= allMapsResponse.pages; pages++) {
      const mapPage = await getMaps({ size: 100, page: pages });
      if (mapPage instanceof ApiError) {
        await this.handleErrors(mapPage);
        return [];
      }
      allMaps.push(...mapPage.data);
    }
  }

  return allMaps;
}
