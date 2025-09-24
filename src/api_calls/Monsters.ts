import { ApiError } from '../classes/Error.js';
import {
  DataPageMonsterSchema,
  GetAllMonstersMonstersGetParams,
} from '../types/types.js';
import { ApiUrl, MyHeaders } from '../utils.js';

export async function getMonsterInformation(
  data: GetAllMonstersMonstersGetParams,
): Promise<DataPageMonsterSchema | ApiError> {
  let requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

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

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /monsters: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}
