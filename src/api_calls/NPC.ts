import { ApiError } from '../classes/Error.js';
import {
  CharacterSchema,
  DataPageNPCItem,
  DataPageNPCSchema,
  GetAllNpcsItemsNpcsItemsGetParams,
  GetAllNpcsNpcsDetailsGetParams,
  GetNpcItemsNpcsItemsCodeGetParams,
  NpcMerchantTransactionResponseSchema,
  NpcMerchantTransactionSchema,
  NPCSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { ApiUrl, MyHeaders, sleep } from '../utils.js';

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
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/npc/buy`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 441:
          message = 'This item is not available for purchase.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 492:
          message = 'The character does not have enough gold.';
          break;
        default:
          message = 'Unknown error from /action/npc/buy';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: NpcMerchantTransactionResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds, result.data.cooldown.reason);

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

/**
 * @description sell items to an npc. Character must be at the same map as the NPC
 * @param character
 * @param items items to sell
 * @returns {NpcMerchantTransactionSchema}
 */
export async function actionSellItem(
  character: CharacterSchema,
  items: SimpleItemSchema,
): Promise<NpcMerchantTransactionSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}}/action/npc/sell`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 442:
          message = 'This item cannot be sold.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 492:
          message = 'The character does not have enough gold.';
          break;
        default:
          message = 'Unknown error from /action/sell/item';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: NpcMerchantTransactionSchema = await response.json();

    await sleep(result.cooldown.remaining_seconds, result.cooldown.reason);

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function getAllNpcs(
  params: GetAllNpcsNpcsDetailsGetParams,
): Promise<ApiError | DataPageNPCSchema> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

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

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /npcs/details`,
      });
    }

    const result: DataPageNPCSchema = await response.json();

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function getNpc(code: string): Promise<ApiError | NPCSchema> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/npcs/details/${code}`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
      }

      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: NPCSchema = await response.json();

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function getNpcItems(
  code: string,
  params: GetNpcItemsNpcsItemsCodeGetParams,
): Promise<ApiError | DataPageNPCItem> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/npcs/items`);

  if (params.page) {
    apiUrl.searchParams.set('page', params.page.toString());
  }
  if (params.size) {
    apiUrl.searchParams.set('size', params.size.toString());
  }

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
      }

      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: DataPageNPCItem = await response.json();

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function getAllNpcItems(
  params: GetAllNpcsItemsNpcsItemsGetParams,
): Promise<ApiError | DataPageNPCItem> {
  const requestOptions = {
    method: 'GET',
    headers: MyHeaders,
  };

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

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /npcs/items`,
      });
    }

    const result: DataPageNPCItem = await response.json();

    return result;
  } catch (error) {
    return error as ApiError;
  }
}
