import { ApiError } from '../core/Error.js';
import {
  StaticDataPageResourceSchema,
  GetAllResourcesResourcesGetParams,
  ResourceResponseSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

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

  return apiRequest<StaticDataPageResourceSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /resources`,
  });
}

export async function getResourceInformation(
  itemCode: string,
): Promise<ResourceResponseSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/resources/${itemCode}`);

  return apiRequest<ResourceResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: 'Item not found.',
    },
    fallbackMessage: 'Unknown error from /action/bank/deposit/item',
  });
}
