import { ApiError } from '../classes/ErrorClass';
import { ApiUrl, MyHeaders } from '../constants';
import {
  GetAllItemsItemsGetData,
  GetAllItemsItemsGetResponse,
  ItemResponseSchema,
  ItemSchema,
} from '../types/types';
import { logger } from '../utils';

export async function getAllItemInformation(
  data: GetAllItemsItemsGetData,
): Promise<GetAllItemsItemsGetResponse> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/items`);

  if (data.query.craft_material) {
    apiUrl.searchParams.set('craft_material', data.query.craft_material);
  }
  if (data.query.craft_skill) {
    apiUrl.searchParams.set('craft_skill', data.query.craft_skill);
  }
  if (data.query.max_level) {
    apiUrl.searchParams.set('max_level', data.query.max_level.toString());
  }
  if (data.query.min_level) {
    apiUrl.searchParams.set('min_level', data.query.min_level.toString());
  }
  if (data.query.name) {
    apiUrl.searchParams.set('name', data.query.name);
  }
  if (data.query.page) {
    apiUrl.searchParams.set('page', data.query.page.toString());
  }
  if (data.query.size) {
    apiUrl.searchParams.set('size', data.query.size.toString());
  }
  if (data.query.type) {
    apiUrl.searchParams.set('skill', data.query.type);
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /items: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error;
  }
}

export async function getItemInformation(
  code: string,
): Promise<ItemSchema | ApiError> {
  var requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(`${ApiUrl}/items/${code}`, requestOptions);

    if (response.status === 404) {
      throw new ApiError({
        code: response.status,
        message: `Item not found.`,
      });
    }

    const data: ItemResponseSchema = await response.json();

    return data.data;
  } catch (error) {
    return error;
  }

  return;
}
