import { ApiError, toApiError } from '../core/Error.js';
import {
  GetAllMapsMapsGetParams,
  StaticDataPageMapSchema,
  MapResponseSchema,
  MapSchema,
} from '../types/types.js';
import { logger, MyHeaders } from '../utils.js';
import { ApiUrl } from '../constants.js';

export async function getMaps(
  params: GetAllMapsMapsGetParams,
): Promise<StaticDataPageMapSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

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

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /maps`,
      });
    }
    return await response.json();
  } catch (error) {
    return toApiError(error);
  }
}

export async function getMapsById(
  mapId: number,
): Promise<MapResponseSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/maps/id/${mapId}`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        default:
          message = 'Unknown error from /maps/id/:mapId';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }
    return await response.json();
  } catch (error) {
    return toApiError(error);
  }
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
