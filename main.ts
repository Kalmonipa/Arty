import { charName } from "./constants";
import { getCharacter, moveCharacter } from "./api_calls/Character";
import { getLocationOfContent } from "./api_calls/Map";
import { Character } from "./types/CharacterData";
import { getResourceLocations } from "./api_calls/Resources";
import { ResourceQueryParameters } from "./types/ResourceData";

async function main() {
  const character: Character = await getCharacter(charName);

  //moveCharacter(0,0)

  //console.log(character.data.hp);



  const queryParams: ResourceQueryParameters = {
    skill: 'fishing',
    max_level: character.data.level
  }

  const fishingTypes = await getResourceLocations(queryParams)
  console.log(fishingTypes)

  const fishingLocations = await getLocationOfContent(fishingTypes.data[0].code, "resource");
  console.log(fishingLocations)

  console.log(character.data.name)

  moveCharacter(character.data.name, fishingLocations.x,fishingLocations.y)
}

main();
