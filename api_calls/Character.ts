import { ApiUrl, MyHeaders } from "../constants";
import { Character } from "../types/CharacterData";

export async function getCharacter(characterName: string) {
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

function moveCharacter(x: string, y: string) {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
    body: JSON.stringify({
      x: x,
      y: y,
    }),
  };

  fetch(`${ApiUrl}/action/move`, requestOptions)
    .then((response) => response.text())
    .then((result) => console.log(result))
    .catch((error) => console.log("error", error));
}
