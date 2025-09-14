import { ApiError } from '../classes/Error';
import { ApiUrl, MyHeaders } from '../constants';
import { CharacterSchema, RecyclingResponseSchema } from '../types/types';
import { logger, sleep } from '../utils';

export async function actionRecycle(
  character: CharacterSchema,
  itemCode: string,
  quantity: number,
): Promise<RecyclingResponseSchema | ApiError> {
  var requestOptions = {
    method: 'POST',
    headers: MyHeaders,
    body: JSON.stringify({
      code: itemCode,
      quantity: quantity,
    }),
  };

  var apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/recycling`);

  logger.info(`Recycling ${quantity} ${itemCode}`)

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      let message: string;
      switch (response.status) {
        case 404:
          message = 'Item not found.';
          break;
        case 473:
          message = 'This item cannot be recycled.';
          break;
        case 478:
          message = 'Missing item or insufficient quantity.';
          break;
        case 486:
          message = 'An action is already in progress for this character.';
          break;
        case 493:
          message = "The character's skill level is too low.";
          break;
      }
      throw new ApiError({
        code: response.status,
        message: message,
      });
    }
    const result: RecyclingResponseSchema = await response.json();
    for (const item of result.data.details.items) {
      logger.info(
        `Gained ${item.quantity} ${item.code} from recycling ${quantity} ${itemCode}`,
      );
    }

    await sleep(
      result.data.cooldown.remaining_seconds,
      result.data.cooldown.reason,
    );

    return result;
  } catch (error) {
    return error;
  }
}
