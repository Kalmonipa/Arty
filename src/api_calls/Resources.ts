import { ApiError } from '../objectives/Error.js';
import {
  DataPageResourceSchema,
  GetAllResourcesResourcesGetParams,
  ResourceResponseSchema,
} from '../types/types.js';
import { ApiUrl, MyHeaders } from '../utils.js';

export async function getAllResourceInformation(
  data: GetAllResourcesResourcesGetParams,
): Promise<DataPageResourceSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

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

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /resources: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}

export async function getResourceInformation(
  itemCode: string
): Promise<ResourceResponseSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/resources/${itemCode}`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
          default:
            message = 'Unknown error from /action/bank/deposit/item';
            break;
        }       
        throw new ApiError({
        code: response.status,
        message: message,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}

