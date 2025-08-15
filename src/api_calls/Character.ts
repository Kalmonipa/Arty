import { ApiUrl, MyHeaders } from "../constants";
import { Character, CharacterMovement } from "../types/CharacterData";
import { logger } from '../utils'

export async function getCharacter(characterName: string): Promise<Character> {
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
  return { x: latestInfo.x, y: latestInfo.y };
}

/**
 * Calculates how much inventory space is being used
 * ToDo: Calculate this as a percentage of the total space
 * @param char Character info to parse
 */
export function getInventorySpace(char: Character): number {
  var usedSpace = 0;
  logger.info('Getting character info')
  logger.info(char)
  char.inventory.forEach((invSlot) => { // ToDo: this is throwing an undefined error because the response doesn't contain a data object
    usedSpace += invSlot.quantity;
  });
  return usedSpace;
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
): Promise<CharacterMovement> {
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
      console.error(
        `ERROR: Response status: ${response.status}; Reason: ${response}`,
      );
    } else {
      const result = await response.json();
      //logger.info(result);
      return result;
    }
  } catch (error) {
    console.error(error.message);
  }
}
