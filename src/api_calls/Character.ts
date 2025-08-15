import { ApiUrl, MyHeaders } from "../constants";
import { Character, CharacterMovement } from "../types/CharacterData";

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
    //console.log(data);
    return data;
  } catch (error) {
    console.error(error);
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
  return { x: latestInfo.data.x, y: latestInfo.data.y };
}

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
      console.log(result);
      return result;
    }
  } catch (error) {
    console.error(error.message);
  }
}
