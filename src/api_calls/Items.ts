import { ApiError } from '../core/Error.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';
import {
  CharacterSchema,
  ClaimPendingItemDataSchema,
  ClaimPendingItemResponseSchema,
  DataPagePendingItemSchema,
  DeleteItemResponseSchema,
  EquipmentResponseSchema,
  EquipSchema,
  GetAllItemsItemsGetParams,
  ItemResponseSchema,
  ItemSchema,
  SimpleItemSchema,
  StaticDataPageItemSchema,
  UnequipSchema,
  UseItemResponseSchema,
} from '../types/types.js';

/**
 * API call to equip the item
 * @param data
 * @returns
 */
export async function actionEquipItem(
  character: CharacterSchema,
  equipment: EquipSchema,
): Promise<EquipmentResponseSchema | ApiError> {
  return apiRequest<EquipmentResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/equip`,
    method: 'POST',
    body: equipment,
    errorMessages: {
      404: 'Item not found.',
      478: 'Missing item or insufficient quantity.',
      483: 'The character does not have enough HP to unequip this item.',
      484: 'The character cannot equip more than 100 utilities in the same slot.',
      485: 'This item is already equipped.',
      496: 'Character does not meet the required condition',
    },
    fallbackMessage: 'Unknown error from /action/equip',
  });
}

/**
 * API call to unequip the item
 * @param data
 * @returns
 */
export async function actionUnequipItem(
  character: CharacterSchema,
  equipment: UnequipSchema,
): Promise<EquipmentResponseSchema | ApiError> {
  return apiRequest<EquipmentResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/unequip`,
    method: 'POST',
    body: equipment,
    errorMessages: {
      404: 'Item not found.',
      478: 'Missing item or insufficient quantity.',
      483: 'The character does not have enough HP to unequip this item.',
      486: 'An action is already in progress for this character.',
      491: 'The equipment slot is empty.',
    },
    fallbackMessage: 'Unknown error from /action/unequip',
  });
}

/**
 * @description Use the specified item
 */
export async function actionUse(
  character: CharacterSchema,
  data: SimpleItemSchema,
): Promise<UseItemResponseSchema | ApiError> {
  return apiRequest<UseItemResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/use`,
    method: 'POST',
    body: data,
    errorMessages: {
      404: 'Item not found.',
      476: 'This item is not a consumable.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      496: 'The character does not meet the required condition.',
    },
    fallbackMessage: 'Unknown error from /action/use',
  });
}

/**
 * @description Uses /items to get all the items that match the input parameters
 * @param data
 * @returns
 */
export async function getAllItemInformation(
  data: GetAllItemsItemsGetParams,
): Promise<StaticDataPageItemSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/items`);

  if (data?.craft_material) {
    apiUrl.searchParams.set('craft_material', data.craft_material);
  }
  if (data?.craft_skill) {
    apiUrl.searchParams.set('craft_skill', data.craft_skill);
  }
  if (data?.max_level) {
    apiUrl.searchParams.set('max_level', data.max_level.toString());
  }
  if (data?.min_level) {
    apiUrl.searchParams.set('min_level', data.min_level.toString());
  }
  if (data?.name) {
    apiUrl.searchParams.set('name', data.name);
  }
  if (data?.page) {
    apiUrl.searchParams.set('page', data.page.toString());
  }
  if (data?.size) {
    apiUrl.searchParams.set('size', data.size.toString());
  }
  if (data?.type) {
    apiUrl.searchParams.set('type', data.type);
  }

  return apiRequest<StaticDataPageItemSchema>({
    url: apiUrl,
    fallbackMessage: `Unknown error from /items`,
  });
}

/**
 * @description returns information about the specified item
 * @param code
 * @returns {ItemResponseSchema}
 */
export async function getItemInformation(
  code: string,
): Promise<ItemSchema | ApiError> {
  const res = await apiRequest<ItemResponseSchema>({
    url: `${ApiUrl}/items/${code}`,
    errorMessages: {
      404: 'Item not found.',
    },
    fallbackMessage: `Unknown error from /items/${code}`,
  });
  return res instanceof ApiError ? res : res.data;
}

/**
 * Delete an item in the characters inventory
 * @param item
 * @returns
 */
export async function actionDeleteItem(
  character: CharacterSchema,
  item: SimpleItemSchema,
): Promise<DeleteItemResponseSchema | ApiError> {
  return apiRequest<DeleteItemResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/delete`,
    method: 'POST',
    body: item,
    errorMessages: {
      422: 'Request could not be processed due to an invalid payload.',
      478: 'Missing required item(s).',
      486: 'An action is already in progress for this character.',
      498: 'Character not found.',
      499: 'The character is in cooldown',
    },
    fallbackMessage: `Unknown error from /my/${character.name}/action/delete`,
  });
}

/**
 * Gets all pending item information
 */
export async function getPendingItems(): Promise<
  DataPagePendingItemSchema | ApiError
> {
  return apiRequest<DataPagePendingItemSchema>({
    url: `${ApiUrl}/my/pending-items`,
    fallbackMessage: 'Unknown error from /my/pending-items',
  });
}

/**
 * Claims all pending items
 * @param itemId: ID of the item to claim
 * @returns
 */
export async function actionClaimPendingItems(
  character: CharacterSchema,
  itemId: string,
): Promise<ClaimPendingItemDataSchema | ApiError> {
  const res = await apiRequest<ClaimPendingItemResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/claim_item/${itemId}`,
    method: 'POST',
    errorMessages: {
      404: 'Pending item not found.',
      422: 'Request could not be processed due to an invalid payload.',
      486: 'An action is already in progress for this character.',
      497: `The character's inventory is full.`,
      498: 'Character not found',
      499: 'The character is in cooldown',
    },
    fallbackMessage: `Unknown error from /my/${character.name}/action/claim/${itemId}`,
    onSuccess: (result) => {
      logger.info(`Claimed pending item ${itemId}`);
      if (result.data.item.gold) {
        logger.info(`Received ${result.data.item.gold} gold`);
      }
      if (result.data.item.items) {
        logger.info(`Received following items:`);
        for (const item of result.data.item.items) {
          logger.info(`  - ${item.quantity}x ${item.code}`);
        }
      }
    },
  });
  return res instanceof ApiError ? res : res.data;
}
