import { CharName } from "./constants";
import {
  getCharacter,
  getCharacterLocation,
  moveCharacter,
} from "./api_calls/Character";
import { getLocationOfContent } from "./api_calls/Map";
import { Character } from "./types/CharacterData";
import { getResourceLocations, gatherResources } from "./api_calls/Resources";
import { ResourceQueryParameters } from "./types/ResourceData";
import { sleep } from "./utils";

const shouldStopActions = false

async function main() {
  let character: Character = await getCharacter(CharName);

  //moveCharacter(0,0)

  //console.log(character.data.hp);

  const queryParams: ResourceQueryParameters = {
    skill: "fishing",
    max_level: character.data.fishing_level,
  };

  const fishingTypes = await getResourceLocations(queryParams);
  //console.log(fishingTypes)

  const fishingLocations = await getLocationOfContent(
    fishingTypes.data[fishingTypes.data.length - 1].code,
    "resource",
  );
  //console.log(fishingLocations)

  //console.log(character.data.name)

  //console.log(fishingLocations.data[0].x)

  const latestLocation = await getCharacterLocation(character.data.name);

  if (
    latestLocation.x === fishingLocations.data[0].x &&
    latestLocation.y === fishingLocations.data[0].y
  ) {
    console.log(
      `We're already at the location x: ${latestLocation.x}, y: ${latestLocation.y}`,
    );
  } else {
    console.log(`Moving to x: ${latestLocation.x}, y: ${latestLocation.y}`);
    const moveResponse = await moveCharacter(
      character.data.name,
      fishingLocations.data[0].x,
      fishingLocations.data[0].y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  console.log(`Gathering resources at x: ${character.data.x}, y: ${character.data.y}`)
  const gatherResponse = await gatherResources(CharName);
  character = gatherResponse.data.character;
  await sleep(gatherResponse.data.cooldown.remaining_seconds);

  // Continue looping through until we stop the program
  if (!shouldStopActions) {
  main();
  } else {
    console.log('Reached end of activities. Exiting')
    process.exit()
  }
}

main();
