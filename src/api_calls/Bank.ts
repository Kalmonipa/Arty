import { ApiError } from '../classes/Error.js';
import { ApiUrl, getRequestOptions, logger, MyHeaders } from '../utils.js';
import {
  BankExtensionTransactionSchema,
  BankGoldTransactionResponseSchema,
  BankResponseSchema,
  CharacterSchema,
  DataPageSimpleItemSchema,
} from '../types/types.js';

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
    return error as ApiError;
  }
}

/**
 * @description deposit gold into the bank. Character must be at the bank map
 * @param character
 * @param craftData
 * @returns {SkillResponseSchema}
 */
export async function actionDepositGold(
  character: CharacterSchema,
  quantity: number,
): Promise<BankGoldTransactionResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify({ quantity: quantity }),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/bank/deposit/gold`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 461:
          message =
            'Some of your items or your gold in the bank are already part of an ongoing transaction.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 492:
          message = 'The character does not have enough gold.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
        default:
          message = 'Unknown error from /action/bank/deposit/gold';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: BankGoldTransactionResponseSchema = await response.json();
    logger.info(
      `Deposited ${quantity} gold. Total gold in bank: ${result.data.bank.quantity}`,
    );
    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function purchaseBankExpansion(
  character: CharacterSchema,
): Promise<BankExtensionTransactionSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify({ name: character.name }),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/bank/buy_expansion`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 492:
          message = 'The character does not have enough gold.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
        case 598:
          message = 'Bank not found on this map.';
          break;
        default:
          message = 'Unknown error from /action/bank/deposit/gold';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: BankExtensionTransactionSchema = await response.json();

    logger.info(`Bank expansion purchased for ${result.transaction.price} gold`)

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function getBankDetails()
  : Promise<BankResponseSchema | ApiError> {
  
    try {
      const response = await fetch(
        `${ApiUrl}/my/bank`,
        getRequestOptions,
      );
  
      if (!response.ok) {
        throw new ApiError({
          code: response.status,
          message: 'Unknown error from /my/bank',
        });
      }
  
      const result: BankResponseSchema = await response.json();
  
      return result;
    } catch (error) {
      return error as ApiError;
    }
}
