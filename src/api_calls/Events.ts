import { ApiError } from '../core/Error.js';
import {
  StaticDataPageActiveEventSchema,
  StaticDataPageEventSchema,
  GetAllActiveEventsEventsActiveGetParams,
  GetAllEventsEventsGetParams,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

export async function getAllEvents(
  params: GetAllEventsEventsGetParams,
): Promise<StaticDataPageEventSchema | ApiError> {
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

  return apiRequest<StaticDataPageEventSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /events`,
  });
}

export async function getActiveEvents(
  params: GetAllActiveEventsEventsActiveGetParams,
): Promise<StaticDataPageActiveEventSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/events/active`);

  if (params.page) {
    apiUrl.searchParams.set('page', String(params.page));
  }
  if (params.size) {
    apiUrl.searchParams.set('size', String(params.size));
  }

  return apiRequest<StaticDataPageActiveEventSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /events/active`,
  });
}
