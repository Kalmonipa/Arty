import { ApiUrl, MyHeaders } from "../constants";
import { ApiError } from "../classes/ErrorClass";
import {
  ActionCraftingMyNameActionCraftingPostData,
  ActionCraftingMyNameActionCraftingPostResponse,
  CharacterMovementResponseSchema,
  CharacterRestResponseSchema,
  CharacterSchema,
  SkillDataSchema,
} from "../types/types";
import { logger } from "../utils";

export async function craftItem(
  character: CharacterSchema,
  craftData: ActionCraftingMyNameActionCraftingPostData,
): Promise<ActionCraftingMyNameActionCraftingPostResponse> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
    body: JSON.stringify(craftData.body),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/crafting`,
      requestOptions,
    );
    // if (!response.ok) {
    //   logger.error(`Craft failed: ${response.status}`);
    // } else
    if (response.status === 486) {
      logger.error(`${character.name} is already doing an action`);
    } else if (response.status === 493) {
      logger.error(`${character.name}s skill level is too low`);
    } else if (response.status === 497) {
      logger.error(`${character.name}s inventory is full`);
    } else {
      const result: ActionCraftingMyNameActionCraftingPostResponse =
        await response.json();
      if (result.data.details.items.length === 1) {
        logger.info(
          `Crafted ${result.data.details.items[0].quantity} ${result.data.details.items[0].code}`,
        );
      } else {
        logger.info(`Crafted ${craftData.body.code}`);
      }
      return result;
    }
  } catch (error) {
    logger.error(error.message);
  }
}

export async function getCharacter(
  characterName: string,
): Promise<CharacterSchema> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/characters/${characterName}`,
      requestOptions,
    );
    const data = await response.json();
    return data.data;
  } catch (error) {
    logger.error(error);
  }
}

/**
 * @description Gets the latest location of the character
 * @param char
 * @returns {x: number, y: number}
 */
export async function getCharacterLocation(
  char: string,
): Promise<{ x: number; y: number }> {
  const latestInfo = await getCharacter(char);
  logger.debug(`Character location: x: ${latestInfo.x}, y: ${latestInfo.y}`);
  return { x: latestInfo.x, y: latestInfo.y };
}

/**
 * Move the character to the specified coords
 * @param charName
 * @param x
 * @param y
 * @returns
 */
export async function actionMove(
  charName: string,
  x: number,
  y: number,
): Promise<CharacterMovementResponseSchema | ApiError> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
    body: JSON.stringify({
      x: x,
      y: y,
    }),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${charName}/action/move`,
      requestOptions,
    );
    
    const result = await response.json();
    
    // Check if the response contains an error
    if (result.error) {
      const apiError = new ApiError(result.error);
      logger.error(`Move failed: ${result.error.message} (Code: ${result.error.code})`);
      return apiError;
    }
    
    // Handle specific HTTP status codes
    if (response.status === 490) {
      logger.error("Character is already at the location");
      return result;
    }
    
    if (!response.ok) {
      const apiError = new ApiError({
        code: response.status,
        message: `Move failed with status: ${response.status}`
      });
      logger.error(`Move failed: ${response.status}`);
      return apiError;
    }
    
    return result;
  } catch (error) {
    const apiError = new ApiError({
      code: 0,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
    logger.error(`Move request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return apiError;
  }
}

export async function restCharacter(
  character: CharacterSchema,
): Promise<CharacterRestResponseSchema> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${character.name}/action/rest`,
      requestOptions,
    );
    // if (!response.ok) {
    //   logger.error(`Move failed: ${response.status}`);
    // }
    if (response.status === 486) {
      logger.error(`${character.name} is already doing an action`);
    } else if (response.status === 498) {
      logger.error(`${character.name} does not exist`);
    } else if (response.status === 499) {
      logger.error(`${character.name} is in cooldown`);
    } else {
      const result: CharacterRestResponseSchema = await response.json();
      logger.info(
        `Resting for ${result.data.cooldown.remaining_seconds} seconds`,
      );
      return result;
    }
  } catch (error) {
    logger.error(error.message);
  }
}
