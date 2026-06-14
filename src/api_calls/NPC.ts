import { ApiError } from '../core/Error.js';
import {
  CharacterSchema,
  StaticDataPageNPCItem,
  StaticDataPageNPCSchema,
  GetAllNpcsItemsNpcsItemsGetParams,
  GetAllNpcsNpcsDetailsGetParams,
  GetNpcItemsNpcsItemsCodeGetParams,
  NpcMerchantTransactionResponseSchema,
  NpcMerchantTransactionSchema,
  NPCResponseSchema,
  NPCSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * @description buy items into the npc. Character must be at the same map as the NPC
 * @param character
 * @param items items to purchase
 * @returns {NpcMerchantTransactionResponseSchema}
 */
export async function actionBuyItem(
  character: CharacterSchema,
  items: SimpleItemSchema,
): Promise<NpcMerchantTransactionResponseSchema | ApiError> {
  return apiRequest<NpcMerchantTransactionResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/npc/buy`),
    method: 'POST',
    body: items,
    errorMessages: {
      404: 'Item not found.',
      441: 'This item is not available for purchase.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      492: 'The character does not have enough gold.',
    },
    fallbackMessage: 'Unknown error from /action/npc/buy',
  });
}

/**
 * @description sell items to an npc. Character must be at the same map as the NPC
 * @param character
 * @param items items to sell
 * @returns {NpcMerchantTransactionResponseSchema}
 */
export async function actionSellItem(
  character: CharacterSchema,
  items: SimpleItemSchema,
): Promise<NpcMerchantTransactionResponseSchema | ApiError> {
  return apiRequest<NpcMerchantTransactionResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/npc/sell`),
    method: 'POST',
    body: items,
    errorMessages: {
      404: 'Item not found.',
      442: 'This item cannot be sold.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      492: 'The character does not have enough gold.',
    },
    fallbackMessage: 'Unknown error from /action/sell/item',
  });
}

export async function getAllNpcs(
  params: GetAllNpcsNpcsDetailsGetParams,
): Promise<ApiError | StaticDataPageNPCSchema> {
  const apiUrl = new URL(`${ApiUrl}/npcs/details`);

  if (params.name) {
    apiUrl.searchParams.set('name', params.name);
  }
  if (params.type) {
    apiUrl.searchParams.set('type', params.type);
  }
  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }

  return apiRequest<StaticDataPageNPCSchema>({
    url: apiUrl,
    fallbackMessage: 'Unknown error from /npcs/details',
  });
}

export async function getNpc(code: string): Promise<ApiError | NPCSchema> {
  const apiUrl = new URL(`${ApiUrl}/npcs/details/${code}`);

  const res = await apiRequest<NPCResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: 'Item not found.',
    },
  });
  return res instanceof ApiError ? res : res.data;
}

export async function getNpcItems(
  code: string,
  params?: GetNpcItemsNpcsItemsCodeGetParams,
): Promise<ApiError | StaticDataPageNPCItem> {
  const apiUrl = new URL(`${ApiUrl}/npcs/items/${code}`);

  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }

  return apiRequest<StaticDataPageNPCItem>({
    url: apiUrl,
    errorMessages: {
      404: 'Item not found.',
    },
  });
}

export async function getAllNpcItems(
  params: GetAllNpcsItemsNpcsItemsGetParams,
): Promise<ApiError | StaticDataPageNPCItem> {
  const apiUrl = new URL(`${ApiUrl}/npcs/items`);

  if (params.code) {
    apiUrl.searchParams.set('code', params.code);
  }
  if (params.currency) {
    apiUrl.searchParams.set('currency', params.currency);
  }
  if (params.npc) {
    apiUrl.searchParams.set('npc', params.npc);
  }
  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }

  return apiRequest<StaticDataPageNPCItem>({
    url: apiUrl,
    fallbackMessage: 'Unknown error from /npcs/items',
  });
}
