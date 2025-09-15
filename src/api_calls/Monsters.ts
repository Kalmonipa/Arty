import { ApiError } from '../classes/Error';
import {
  GetAllMonstersMonstersGetResponse,
  GetAllMonstersMonstersGetData,
} from '../types/types';
import { ApiUrl, MyHeaders } from '../utils';

export async function getMonsterInformation(
  data: GetAllMonstersMonstersGetData,
): Promise<GetAllMonstersMonstersGetResponse | ApiError> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/monsters`);

  if (data.query.drop) {
    apiUrl.searchParams.set('drop', data.query.drop);
  }
  if (data.query.max_level) {
    apiUrl.searchParams.set('max_level', data.query.max_level.toString());
  }
  if (data.query.min_level) {
    apiUrl.searchParams.set('min_level', data.query.min_level.toString());
  }
  if (data.query.page) {
    apiUrl.searchParams.set('page', data.query.page.toString());
  }
  if (data.query.size) {
    apiUrl.searchParams.set('size', data.query.size.toString());
  }
  if (data.query.name) {
    apiUrl.searchParams.set('name', data.query.name);
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
    return error;
  }
}
