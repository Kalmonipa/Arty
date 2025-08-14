import { charName } from "./constants";
import { getCharacter } from "./api_calls/Character";
import { getLocationOfContent } from "./api_calls/Map";
import { Character } from "./types/CharacterData";

async function main() {
  const character: Character = await getCharacter(charName);

  //console.log(character.data.hp);

  const chicken = await getLocationOfContent("chicken");
  console.log(chicken)
}

main();
