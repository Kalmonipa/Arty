import { ApiError } from '../classes/Error.js';
import {
  BankItemTransactionResponseSchema,
  CharacterFightResponseSchema,
  CharacterMovementResponseSchema,
  CharacterRestResponseSchema,
  CharacterSchema,
  CombatSimulationResponseSchema,
  CraftingSchema,
  DestinationSchema,
  FakeCharacterSchema,
  SimpleItemSchema,
  SkillResponseSchema,
} from '../types/types.js';
import { ApiUrl, MyHeaders, logger, sleep } from '../utils.js';

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
  const requestOptions = {
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
      let message: string;
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
        default:
          message = 'Unknown error from /action/crafting';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: SkillResponseSchema = await response.json();

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
 * @description deposit items into the bank. Character must be at the bank map
 * @param character
 * @param items items to deposit
 * @returns {BankItemTransactionResponseSchema}
 */
export async function actionDepositItems(
  character: CharacterSchema,
  items: SimpleItemSchema[],
): Promise<BankItemTransactionResponseSchema | ApiError> {
  const requestOptions = {
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
      let message: string;
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
        default:
          message = 'Unknown error from /action/bank/deposit/item';
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
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/fight`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
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
        default:
          message = 'Unknown error from /action/fight';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterFightResponseSchema = await response.json();

    logger.info(
      `Fight against ${result.data.fight.opponent} was a ${result.data.fight.result} after ${result.data.fight.turns} turns.`,
    );

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function actionGather(
  character: CharacterSchema,
): Promise<SkillResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/gathering`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
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
        default:
          message = 'Unknown error from /action/gathering';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: SkillResponseSchema = await response.json();

    for (const item of result.data.details.items) {
      logger.info(
        `Gathered ${item.quantity} ${item.code} at x: ${character.x}, y: ${character.y}`,
      );
    }

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }
    return new ApiError({
      code: 500,
      message: `Unexpected error in actionGather: ${error instanceof Error ? error.message : String(error)}`,
    });
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
  const requestOptions = {
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
      let message: string;
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
        case 496:
          message = 'Conditions not met.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
        default:
          message = 'Unknown error from /action/move';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterMovementResponseSchema = await response.json();

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function actionRest(
  character: CharacterSchema,
): Promise<CharacterRestResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/rest`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
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
        default:
          message = 'Unknown error from /action/rest';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: CharacterRestResponseSchema = await response.json();

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
 * @description withdraw items from the bank. Character must be at the bank map
 * @param character
 * @param items items to withdraw
 * @returns {BankItemTransactionResponseSchema}
 */
export async function actionWithdrawItem(
  character: CharacterSchema,
  items: SimpleItemSchema[],
): Promise<BankItemTransactionResponseSchema | ApiError> {
  const requestOptions = {
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
      let message: string;
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
        default:
          message = 'Unknown error from /action/withdraw/item';
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

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function fightSimulator(
  characters: FakeCharacterSchema[],
  monsterCode: string,
  iterations: number,
): Promise<CombatSimulationResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify({
      characters: characters,
      monster: monsterCode,
      iterations: iterations,
    }),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/simulation/fight_simulation`,
      requestOptions,
    );

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Monster not found.';
          break;
        case 422:
          message = 'Request could not be processed due to an invalid payload.';
          break;
        case 451:
          message = 'Access denied, you must be a member to do that.';
          break;
        default:
          message = 'Unknown error from /simulation/fight_simulation';
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    return await response.json();
  } catch (error) {
    return error as ApiError;
  }
}
