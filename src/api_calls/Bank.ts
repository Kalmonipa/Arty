import { ApiError } from '../classes/Error';
import { ApiUrl, getRequestOptions } from '../utils';
import { DataPageSimpleItemSchema } from '../types/types';

export async function getBankItems(
  item_code?: string,
  page?: number,
  size?: number,
): Promise<DataPageSimpleItemSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/my/bank/items`);

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
    const response = await fetch(apiUrl, getRequestOptions);
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
