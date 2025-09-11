import { ApiError } from '../classes/Error';
import { ApiUrl, MyHeaders } from '../constants';
import {
  DataPageSimpleItemSchema,
  GetAllMapsMapsGetResponse,
  SimpleItemSchema,
} from '../types/types';
import { logger } from '../utils';

export async function getBankItems(
  item_code?: string,
  page?: number,
  size?: number,
): Promise<DataPageSimpleItemSchema | ApiError> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/bank/items`);

  if (item_code) {
    apiUrl.searchParams.set('item_code', item_code);
  }
  if (page) {
    apiUrl.searchParams.set('page', page.toString());
  }
  if (size) {
    apiUrl.searchParams.set('size', size.toString());
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /my/bank/items: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error;
  }
}
