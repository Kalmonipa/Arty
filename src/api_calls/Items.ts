import { ApiError } from '../objectives/Error.js';
import { ApiUrl, getRequestOptions, MyHeaders, sleep } from '../utils.js';
import {
  CharacterSchema,
  DataPageItemSchema,
  EquipmentResponseSchema,
  EquipSchema,
  GetAllItemsItemsGetParams,
  ItemResponseSchema,
  ItemSchema,
  SimpleItemSchema,
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
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(equipment),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/equip`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 483:
          message =
            'The character does not have enough HP to unequip this item.';
          break;
        case 484:
          message =
            'The character cannot equip more than 100 utilities in the same slot.';
          break;
        case 485:
          message = 'This item is already equipped.';
          break;
        case 496:
          message = 'Character does not meet the required condition';
          break;
        default:
          message = 'Unknown error from /action/equip';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: EquipmentResponseSchema = await response.json();

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
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
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(equipment),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/unequip`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 483:
          message =
            'The character does not have enough HP to unequip this item.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 491:
          message = 'The equipment slot is empty.';
          break;
        default:
          message = 'Unknown error from /action/unequip';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: EquipmentResponseSchema = await response.json();

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

/**
 * @description Use the specified item
 */
export async function actionUse(
  character: CharacterSchema,
  data: SimpleItemSchema,
): Promise<UseItemResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(data),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/use`,
      requestOptions,
    );
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 476:
          message = 'This item is not a consumable.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 496:
          message = 'The character does not meet the required condition.';
          break;
        default:
          message = 'Unknown error from /action/use';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: UseItemResponseSchema = await response.json();

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

/**
 * @description Uses /items to get all the items that match the input parameters
 * @param data
 * @returns
 */
export async function getAllItemInformation(
  data: GetAllItemsItemsGetParams,
): Promise<DataPageItemSchema | ApiError> {
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

  try {
    const response = await fetch(apiUrl, getRequestOptions);

    // ToDo: add more error handling
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /items`,
      });
    }
    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}

/**
 * @description returns information about the specified item
 * @param code
 * @returns {ItemResponseSchema}
 */
export async function getItemInformation(
  code: string,
): Promise<ItemSchema | ApiError> {
  try {
    const response = await fetch(`${ApiUrl}/items/${code}`, getRequestOptions);

    // ToDo: add more error handling into here
    if (response.status === 404) {
      throw new ApiError({
        code: response.status,
        message: `Item not found.`,
      });
    }

    const data: ItemResponseSchema = await response.json();

    return data.data;
  } catch (error) {
    return error as ApiError;
  }
}
