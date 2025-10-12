import { ApiError } from '../objectives/Error.js';
import {
  DataPageActiveEventSchema,
  DataPageEventSchema,
  GetAllActiveEventsEventsActiveGetParams,
  GetAllEventsEventsGetParams,
} from '../types/types.js';
import { ApiUrl, MyHeaders } from '../utils.js';

export async function getAllEvents(
  params: GetAllEventsEventsGetParams,
): Promise<DataPageEventSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/events`);

  if (params.type) {
    apiUrl.searchParams.set('type', params.type);
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
        message: `Unknown error from /events: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}

export async function getActiveEvents(
  params: GetAllActiveEventsEventsActiveGetParams,
): Promise<DataPageActiveEventSchema | ApiError> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/events/active`);

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
        message: `Unknown error from /events/active: ${response}`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}
