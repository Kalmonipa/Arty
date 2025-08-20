import { Character } from '../classes/CharacterClass';
import { ApiError } from '../classes/ErrorClass';
import { ApiUrl, MyHeaders } from '../constants';
import {
  ActionCraftingMyNameActionCraftingPostResponse,
  BankGoldTransactionResponseSchema,
  BankGoldTransactionSchema,
  BankItemTransactionResponseSchema,
  BankItemTransactionSchema,
  CharacterFightResponseSchema,
  CharacterMovementResponseSchema,
  CharacterRestResponseSchema,
  CharacterSchema,
  CraftingSchema,
  DestinationSchema,
  RewardDataResponseSchema,
  SimpleItemSchema,
  SkillResponseSchema,
} from '../types/types';
import { logger, sleep } from '../utils';

/**
 * Hands in a task if all requirements are fulfilled
 * @param characterName
 * @returns {RewardDataResponseSchema}
 */
export async function completeTask(
  characterName: string,
): Promise<RewardDataResponseSchema> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${characterName}/action/task/complete`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 487:
          message = 'The character has no task assigned.';
          break;
        case 488: // ToDo: if this gets returned, the char should automatically resume the task objectives
          message = 'The character has not completed the task.';
          break;
        case 497:
          message = 'The characters inventory is full.';
          break;
        case 498:
          message = 'Character not found.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    return await response.json();
  } catch (error) {
    console.error(error);
  }
}

/**
 * @description craft the specified item
 * @param character
 * @param craftData
 * @returns {SkillResponseSchema}
 */
export async function actionCraft(
  character: CharacterSchema,
  craftData: CraftingSchema,
): Promise<SkillResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(craftData),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/crafting`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 404:
          message = 'Craft not found.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 493:
          message = 'The characters skill level is too low.';
          break;
        case 497:
          message = 'The characters inventory is full.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: SkillResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    return error;
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
  var requestOptions = {
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
      var message: string;
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
    return error;
  }
}

/**
 * @description deposit items into the bank. Character must be at the bank map
 * @param character
 * @param items items to deposit
 * @returns {BankItemTransactionResponseSchema}
 */
export async function actionDepositItems(
  character: CharacterSchema,
  items: SimpleItemSchema[],
): Promise<BankItemTransactionResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/bank/deposit/item`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 461:
          message =
            'Some of your items or your gold in the bank are already part of an ongoing transaction.';
          break;
        case 462:
          message = 'Your bank is full.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: BankItemTransactionResponseSchema = await response.json();
    items.forEach(function (item) {
      logger.info(`Deposited ${item.quantity} ${item.code} into the bank`);
    });

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    return error;
  }
}

/**
 * @description
 */

/**
 * @description
 * @param character
 * @param craftData
 * @returns {CharacterFightResponseSchema}
 */
export async function actionFight(
  character: CharacterSchema,
): Promise<CharacterFightResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/fight`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 497:
          message = 'The characters inventory is full.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
        case 598:
          message = 'Monster not found on this map.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterFightResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    logger.error(
      `${error.code} - Fight request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return error;
  }
}

export async function actionGather(
  character: CharacterSchema,
): Promise<SkillResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/gathering`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 493:
          message = 'The characters skill level is too low.';
          break;
        case 497:
          message = 'The characters inventory is full.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    logger.info(`Gathering at x: ${character.x}, y: ${character.y}`);

    const result: SkillResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    return error;
  }
}

/**
 * @description Move the character to the specified coords
 * @param charName
 * @param destination x,y coordinates
 * @returns
 */
export async function actionMove(
  character: CharacterSchema,
  destination: DestinationSchema,
): Promise<CharacterMovementResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(destination),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/move`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 404:
          message = 'Map not found';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 490:
          message = 'The character is already at the destination.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterMovementResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    return error;
  }
}

export async function actionRest(
  character: CharacterSchema,
): Promise<CharacterRestResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/rest`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterRestResponseSchema = await response.json();

    await sleep(result.data.cooldown.remaining_seconds);

    return result;
  } catch (error) {
    return error;
  }
}

/**
 * @description withdraw items from the bank. Character must be at the bank map
 * @param character
 * @param items items to withdraw
 * @returns {BankItemTransactionResponseSchema}
 */
export async function actionWithdrawItem(
  character: CharacterSchema,
  items: SimpleItemSchema[],
): Promise<BankItemTransactionResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/bank/withdraw/item`,
      requestOptions,
    );

    if (!response.ok) {
      var message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 461:
          message =
            'Some of your items or your gold in the bank are already part of an ongoing transaction.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 497:
          message = "The character's inventory is full.";
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: BankItemTransactionResponseSchema = await response.json();
    items.forEach(function (item) {
      logger.info(`Withdrew ${item.quantity} ${item.code} from the bank`);
    });
    return result;
  } catch (error) {
    return error;
  }
}
