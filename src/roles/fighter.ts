import { checkHealth } from "../actions";
import { CharName } from "../constants";
import { logger } from "../utils";
import { getCharacter, restCharacter } from "../api_calls/Character";
import { Character, HealthStatus } from "../types/CharacterData";

export async function beFighter() {
  let character: Character = await getCharacter(CharName);

  // List of steps for fighting
  // 1. Check health
  //    - Heal if needed (rest or eat food). Start with rest because low max health
  // 2. Check inventory space
  // 3. Find nearest monster to fight
  // 4. Move to monster
  // 5. Fight
  // 6. Repeat

  const healthStatus: HealthStatus = checkHealth(character);

  if (healthStatus.percentage !== 100) {
    if (healthStatus.difference < 300) {
      const restResponse = await restCharacter(character);
      character = restResponse.character;
    } //else {
    // Eat food
    //}
  }

  logger.info(`${character.name} is a fighter`);
}
