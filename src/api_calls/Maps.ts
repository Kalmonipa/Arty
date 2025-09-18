import { ApiError } from '../classes/Error.js';
import { GetAllMapsMapsGetParams, DataPageMapSchema } from '../types/types.js';
import { ApiUrl, MyHeaders } from '../utils.js';

export async function getMaps(
  params: GetAllMapsMapsGetParams,
): Promise<DataPageMapSchema | ApiError> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/maps`);

  if (params.content_code) {
    apiUrl.searchParams.set('content_code', params.content_code);
  }
  if (params.content_type) {
    apiUrl.searchParams.set('content_type', params.content_type);
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /maps: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}
