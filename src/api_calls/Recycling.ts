import { ApiError } from '../core/Error.js';
import { CharacterSchema, RecyclingResponseSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

export async function actionRecycle(
  character: CharacterSchema,
  itemCode: string,
  quantity: number,
): Promise<RecyclingResponseSchema | ApiError> {
  const apiUrl = new URL(`${ApiUrl}/my/${character.name}/action/recycling`);

  logger.info(`Recycling ${quantity} ${itemCode}`);

  return apiRequest<RecyclingResponseSchema>({
    url: apiUrl,
    method: 'POST',
    body: {
      code: itemCode,
      quantity: quantity,
    },
    errorMessages: {
      404: 'Item not found.',
      473: 'This item cannot be recycled.',
      478: 'Missing item or insufficient quantity.',
      486: 'An action is already in progress for this character.',
      493: "The character's skill level is too low.",
    },
    fallbackMessage: 'Unknown error from /action/recycle',
    onSuccess: (result) => {
      for (const item of result.data.details.items) {
        logger.info(
          `Gained ${item.quantity} ${item.code} from recycling ${quantity} ${itemCode}`,
        );
      }
    },
  });
}
