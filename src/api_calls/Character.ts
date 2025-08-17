import { ApiUrl, MyHeaders } from "../constants";
import {
  CharacterMovementResponseSchema,
  CharacterRestResponseSchema,
  CharacterSchema,
} from "../types/types";
import { logger } from "../utils";

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
export async function moveCharacter(
  charName: string,
  x: number,
  y: number,
): Promise<CharacterMovementResponseSchema> {
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
    if (!response.ok) {
      logger.error(`Move failed: ${response.status}`);
    }
    if (response.status === 490) {
      logger.error("Character is already at the location");
    } else {
      const result = await response.json();
      //logger.info(result);
      return result;
    }
  } catch (error) {
    logger.error(error.message);
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
      logger.info(`Resting for ${result.data.cooldown.remaining_seconds}`);
      return result;
    }
  } catch (error) {
    logger.error(error.message);
  }
}
