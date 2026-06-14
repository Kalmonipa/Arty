import { ApiError } from '../core/Error.js';
import {
  CharacterSchema,
  RewardDataResponseSchema,
  SimpleItemSchema,
  TaskCancelledResponseSchema,
  TaskResponseSchema,
  TaskTradeResponseSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

export async function actionAcceptNewTask(
  character: CharacterSchema,
): Promise<TaskResponseSchema | ApiError> {
  return apiRequest<TaskResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/task/new`),
    method: 'POST',
    errorMessages: {
      486: 'An action is already in progress for this character.',
      497: "The character's inventory is full.",
      489: 'The character already has an assigned task.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      598: 'Tasks Master not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/task/new',
    onSuccess: (result) => {
      logger.info(
        `Accepted task for ${result.data.task.total} ${result.data.task.code}`,
      );
      let rewards: string = '';
      for (const reward of result.data.task.rewards.items) {
        rewards += `${reward.quantity} ${reward.code},`;
      }
      logger.info(
        `Rewards are ${rewards} and ${result.data.task.rewards.gold} gold`,
      );
    },
  });
}

export async function actionCancelTask(
  character: CharacterSchema,
): Promise<TaskCancelledResponseSchema | ApiError> {
  return apiRequest<TaskCancelledResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/task/cancel`),
    method: 'POST',
    errorMessages: {
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      498: 'Character not found.',
      499: 'The character is in cooldown.',
      598: 'Tasks Master not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/task/cancel',
    onSuccess: () => {
      logger.info(`Cancelled current task.`);
    },
  });
}

export async function actionCompleteTask(
  character: CharacterSchema,
): Promise<RewardDataResponseSchema | ApiError> {
  return apiRequest<RewardDataResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/task/complete`),
    method: 'POST',
    errorMessages: {
      486: 'An action is already in progress for this character.',
      487: 'The character has no task assigned.',
      488: 'The character has not completed the task.',
      497: 'The characters inventory is full.',
      498: 'Character not found.',
      598: 'Tasks Master not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/task/complete',
    onSuccess: (result) => {
      logger.info(`Completed task successfully`);
      let rewards: string = '';
      for (const reward of result.data.rewards.items) {
        rewards += `${reward.quantity} ${reward.code},`;
      }
      logger.info(`Received ${rewards} and ${result.data.rewards.gold} gold`);
    },
  });
}

export async function actionTasksTrade(
  character: CharacterSchema,
  items: SimpleItemSchema,
): Promise<ApiError | TaskTradeResponseSchema> {
  return apiRequest<TaskTradeResponseSchema>({
    url: new URL(`${ApiUrl}/my/${character.name}/action/task/trade`),
    method: 'POST',
    body: {
      code: items.code,
      quantity: items.quantity,
    },
    errorMessages: {
      474: 'The character does not have this task.',
      475: 'Task already completed or too many items submitted.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      498: 'Character not found.',
      598: 'Tasks Master not found on this map.',
    },
    fallbackMessage: 'Unknown error from /action/task/trade',
    onSuccess: (result) => {
      logger.info(
        `Successfully traded ${result.data.trade.quantity} ${result.data.trade.code} to the task master`,
      );
    },
  });
}
