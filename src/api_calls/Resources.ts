import { ApiError } from '../classes/Error';
import {
  DataPageResourceSchema,
  GetAllResourcesResourcesGetParams,
} from '../types/types';
import { ApiUrl, MyHeaders } from '../utils';

export async function getResourceInformation(
  data: GetAllResourcesResourcesGetParams,
): Promise<DataPageResourceSchema> {
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
    return error;
  }
}
