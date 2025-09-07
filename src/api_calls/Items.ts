import { Character } from '../classes/CharacterClass';
import { ApiError } from '../classes/ErrorClass';
import { ApiUrl, MyHeaders } from '../constants';
import {
  CharacterSchema,
  EquipmentResponseSchema,
  EquipSchema,
  GetAllItemsItemsGetData,
  GetAllItemsItemsGetResponse,
  ItemResponseSchema,
  ItemSchema,
  SimpleItemSchema,
  UnequipSchema,
  UseItemResponseSchema,
} from '../types/types';
import { sleep } from '../utils';

/**
 * API call to equip the item
 * @param data
 * @returns
 */
export async function actionEquipItem(
  character: CharacterSchema,
  equipment: EquipSchema,
): Promise<EquipmentResponseSchema | ApiError> {
  var requestOptions = {
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
      var message: string;
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
    return error;
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
  var requestOptions = {
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
      var message: string;
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
    return error;
  }
}

/**
 * @description Use the specified item
 */
export async function actionUse(character: CharacterSchema, data: SimpleItemSchema): Promise<UseItemResponseSchema | ApiError> {
    var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(data),
  };

    try {
    const response = await fetch(`${ApiUrl}/my/${character.name}/action/use`, requestOptions);
    if (!response.ok) {
      throw new ApiError({
        code: response.status,
        message: `Unknown error from /action/use: ${response}`,
      });
    }

    const result: UseItemResponseSchema = await response.json();
    
    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result
  } catch (error) {
    return error;
  }
}

/**
 * @description Uses /items to get all the items that match the input parameters
 * @param data
 * @returns
 */
export async function getAllItemInformation(
  data: GetAllItemsItemsGetData,
): Promise<GetAllItemsItemsGetResponse | ApiError> {
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
    apiUrl.searchParams.set('type', data.query.type);
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

/**
 * @description returns information about the specified item
 * @param code
 * @returns {ItemResponseSchema}
 */
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
}
