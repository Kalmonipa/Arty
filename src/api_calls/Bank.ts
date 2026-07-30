import { ApiError } from '../core/Error.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import {
  BankExtensionTransactionResponseSchema,
  BankGoldTransactionResponseSchema,
  BankResponseSchema,
  CharacterSchema,
  DataPageSimpleItemSchema,
} from '../types/types.js';
import { apiRequest } from './request.js';

/**
 * @description Fetch all items in your bank.
 * @param item_code item code to filter
 * @param page
 * @param size
 * @returns {DataPageSimpleItemSchema}
 */
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

  return apiRequest<DataPageSimpleItemSchema>({
    url: apiUrl,
    fallbackMessage: 'Unknown error from /my/bank/items',
  });
}

/**
 * @description deposit gold into the bank. Character must be at the bank map
 * @param character
 * @param craftData
 * @returns {BankGoldTransactionResponseSchema}
 */
export async function actionDepositGold(
  character: CharacterSchema,
  quantity: number,
): Promise<BankGoldTransactionResponseSchema | ApiError> {
  return apiRequest<BankGoldTransactionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/bank/deposit/gold`,
    method: 'POST',
    body: { quantity: quantity },
    errorMessages: {
      461: 'Some of your items or your gold in the bank are already part of an ongoing transaction.',
      486: 'An action is already in progress for this character.',
      492: 'The character does not have enough gold.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
    },
    fallbackMessage: 'Unknown error from /action/bank/deposit/gold',
    onSuccess: (result) => {
      logger.info(
        `Deposited ${quantity} gold. Total gold in bank: ${result.data.bank.quantity}`,
      );
    },
  });
}

/**
 * @description withdraw gold from the bank. Character must be at the bank map
 * @param character
 * @param craftData
 * @returns {BankGoldTransactionResponseSchema}
 */
export async function actionWithdrawGold(
  character: CharacterSchema,
  quantity: number,
): Promise<BankGoldTransactionResponseSchema | ApiError> {
  return apiRequest<BankGoldTransactionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/bank/withdraw/gold`,
    method: 'POST',
    body: { quantity: quantity },
    errorMessages: {
      422: 'Request could not be processed due to an invalid payload.',
      460: 'nsufficient gold in your bank.',
      461: 'Some of your items or your gold in the bank are already part of an ongoing transaction.',
      486: 'An action is already in progress for this character.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
    },
    fallbackMessage: 'Unknown error from /action/bank/withdraw/gold',
    onSuccess: (result) => {
      logger.info(
        `Withdrew ${quantity} gold. Total gold in bank: ${result.data.bank.quantity}`,
      );
    },
  });
}

export async function purchaseBankExpansion(
  character: CharacterSchema,
): Promise<BankExtensionTransactionResponseSchema | ApiError> {
  return apiRequest<BankExtensionTransactionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/bank/buy_expansion`,
    method: 'POST',
    body: { name: character.name },
    errorMessages: {
      486: 'An action is already in progress for this character.',
      492: 'The character does not have enough gold.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      598: 'Bank not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/bank/buy_expansion',
    onSuccess: (result) => {
      logger.info(
        `Bank expansion purchased for ${result.data.transaction.price} gold.`,
      );
    },
  });
}

export async function getBankDetails(): Promise<BankResponseSchema | ApiError> {
  return apiRequest<BankResponseSchema>({
    url: `${ApiUrl}/my/bank`,
    fallbackMessage: 'Unknown error from /my/bank',
  });
}
