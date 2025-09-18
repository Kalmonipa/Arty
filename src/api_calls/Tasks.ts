import { ApiError } from '../classes/Error.js';
import {
  CharacterSchema,
  RewardDataResponseSchema,
  SimpleItemSchema,
  TaskResponseSchema,
  TaskTradeResponseSchema,
} from '../types/types.js';
import { ApiUrl, MyHeaders, logger, sleep } from '../utils.js';

export async function actionAcceptNewTask(
  character: CharacterSchema,
): Promise<TaskResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/task/new`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 497:
          message = "The character's inventory is full.";
          break;
        case 489:
          message = 'The character already has an assigned task.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 499:
          message = 'The character is in cooldown.';
          break;
        case 598:
          message = 'Tasks Master not found on this map.';
          break;
        default:
          message = 'Unknown error from /action/task/new'
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: TaskResponseSchema = await response.json();

    logger.info(
      `Accepted task for ${result.data.task.total} ${result.data.task.code}`,
    );
    let rewards: string = '';
    for (const reward of result.data.task.rewards.items) {
      rewards += `${reward.quantity} ${reward.code}, `;
    }
    logger.info(
      `Rewards are ${rewards} and ${result.data.task.rewards.gold} gold`,
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

export async function actionCompleteTask(
  character: CharacterSchema,
): Promise<RewardDataResponseSchema | ApiError> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/task/complete`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 487:
          message = 'The character has no task assigned.';
          break;
        case 488:
          message = 'The character has not completed the task.';
          break;
        case 497:
          message = 'The characters inventory is full.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 598:
          message = 'Tasks Master not found on this map.';
          break;
        default:
          message = 'Unknown error from /action/task/complete'
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: RewardDataResponseSchema = await response.json();

    logger.info(`Completed task successfully`);
    let rewards: string = '';
    for (const reward of result.data.rewards.items) {
      rewards += `${reward.quantity} ${reward.code}, `;
    }
    logger.info(`Received ${rewards} and ${result.data.rewards.gold} gold`);

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error as ApiError;
  }
}

export async function actionTasksTrade(
  character: CharacterSchema,
  items: SimpleItemSchema,
): Promise<ApiError | TaskTradeResponseSchema> {
  const requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify({
      code: items.code,
      quantity: items.quantity,
    }),
  };

  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/task/trade`);

  try {
    const response = await fetch(apiUrl, requestOptions);

    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 474:
          message = 'The character does not have this task.';
          break;
        case 475:
          message = 'Task already completed or too many items submitted.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 498:
          message = 'Character not found.';
          break;
        case 598:
          message = 'Tasks Master not found on this map.';
          break;
        default:
          message = 'Unknown error from /action/task/trade'
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }

    const result: TaskTradeResponseSchema = await response.json();

    logger.info(
      `Successfully traded ${result.data.trade.quantity} ${result.data.trade.code} to the task master`,
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
