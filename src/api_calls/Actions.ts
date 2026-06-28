import { ApiError } from '../core/Error.js';
import {
  BankItemTransactionResponseSchema,
  CharacterFightResponseSchema,
  CharacterMovementResponseSchema,
  CharacterRestResponseSchema,
  CharacterSchema,
  CharacterTransitionResponseSchema,
  CombatSimulationResponseSchema,
  CraftingSchema,
  DestinationSchema,
  FakeCharacterSchema,
  SimpleItemSchema,
  SkillResponseSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

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
  return apiRequest<SkillResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/crafting`,
    method: 'POST',
    body: craftData,
    errorMessages: {
      404: 'Craft not found.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      493: 'The characters skill level is too low.',
      497: 'The characters inventory is full.',
      598: 'Workshop not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/crafting',
  });
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
  return apiRequest<BankItemTransactionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/bank/deposit/item`,
    method: 'POST',
    body: items,
    errorMessages: {
      404: 'Item not found.',
      461: 'Some of your items or your gold in the bank are already part of an ongoing transaction.',
      462: 'Your bank is full.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
    },
    fallbackMessage: 'Unknown error from /action/bank/deposit/item',
    onSuccess: () => {
      items.forEach((item) => {
        logger.info(`Deposited ${item.quantity} ${item.code} into the bank`);
      });
    },
  });
}

/**
 * @description
 * @param character
 * @param craftData
 * @returns {CharacterFightResponseSchema}
 */
export async function actionFight(
  character: CharacterSchema,
  participants?: string[],
): Promise<CharacterFightResponseSchema | ApiError> {
  return apiRequest<CharacterFightResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/fight`,
    method: 'POST',
    body: participants,
    errorMessages: {
      422: 'Request could not be processed due to an invalid payload.',
      486: 'An action is already in progress for this character.',
      497: 'The characters inventory is full.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      598: 'Monster not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/fight',
    onSuccess: (result) => {
      logger.info(
        `Fight against ${result.data.fight.opponent} was a ${result.data.fight.result} after ${result.data.fight.turns} turns.`,
      );
    },
  });
}

export async function actionGather(
  character: CharacterSchema,
): Promise<SkillResponseSchema | ApiError> {
  return apiRequest<SkillResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/gathering`,
    method: 'POST',
    errorMessages: {
      486: 'An action is already in progress for this character.',
      493: 'The characters skill level is too low.',
      497: 'The characters inventory is full.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      598: 'Resource not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/gathering',
    onSuccess: (result) => {
      for (const item of result.data.details.items) {
        logger.info(
          `Gathered ${item.quantity} ${item.code} at x: ${character.x}, y: ${character.y}`,
        );
      }
    },
  });
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
  return apiRequest<CharacterMovementResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/move`,
    method: 'POST',
    body: destination,
    errorMessages: {
      404: 'Map not found',
      486: 'An action is already in progress for this character.',
      490: 'The character is already at the destination.',
      496: 'Conditions not met.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      595: 'No path available to the destination map.',
      596: 'The map is blocked and cannot be accessed.',
    },
    fallbackMessage: 'Unknown error from /action/move',
  });
}

export async function actionRest(
  character: CharacterSchema,
): Promise<CharacterRestResponseSchema | ApiError> {
  return apiRequest<CharacterRestResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/rest`,
    method: 'POST',
    errorMessages: {
      486: 'An action is already in progress for this character.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
    },
    fallbackMessage: 'Unknown error from /action/rest',
  });
}

/**
 * @description transition from one layer to another
 */
export async function actionTransition(
  character: CharacterSchema,
): Promise<CharacterTransitionResponseSchema | ApiError> {
  const result = await apiRequest<CharacterTransitionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/transition`,
    method: 'POST',
    errorMessages: {
      404: 'Map not found.',
      422: 'Request could not be processed due to an invalid payload.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      492: 'Insufficient gold for this transition.',
      496: 'Conditions not met.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
    },
    fallbackMessage: 'Unknown error from /action/transition',
    // Validate the response structure before the cooldown sleep, matching the
    // pre-wrapper behaviour of logging the destination on success.
    onSuccess: (res) => {
      if (!res || !res.data) {
        logger.error('Invalid transition response structure:', res);
        return;
      }
      logger.info(
        `Successfully transitioned to ${res.data.destination.name} (id: ${res.data.destination.map_id}, x: ${res.data.destination.x}, y: ${res.data.destination.y})`,
      );
    },
  });

  if (!(result instanceof ApiError) && (!result || !result.data)) {
    return new ApiError({
      code: 500,
      message: 'Invalid transition response from server',
    });
  }

  return result;
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
  return apiRequest<BankItemTransactionResponseSchema>({
    url: `${ApiUrl}/my/${character.name}/action/bank/withdraw/item`,
    method: 'POST',
    body: items,
    errorMessages: {
      404: 'Item not found.',
      461: 'Some of your items or your gold in the bank are already part of an ongoing transaction.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      497: "The character's inventory is full.",
    },
    fallbackMessage: 'Unknown error from /action/withdraw/item',
    onSuccess: () => {
      items.forEach((item) => {
        logger.info(`Withdrew ${item.quantity} ${item.code} from the bank`);
      });
    },
  });
}

export async function fightSimulator(
  characters: FakeCharacterSchema[],
  monsterCode: string,
  iterations: number,
): Promise<CombatSimulationResponseSchema | ApiError> {
  return apiRequest<CombatSimulationResponseSchema>({
    url: `${ApiUrl}/simulation/fight`,
    method: 'POST',
    body: {
      characters: characters,
      monster: monsterCode,
      iterations: iterations,
    },
    errorMessages: {
      404: 'Monster not found.',
      422: 'Request could not be processed due to an invalid payload.',
      451: 'Access denied, you must be a member to do that.',
    },
    fallbackMessage: 'Unknown error from /simulation/fight',
  });
}
