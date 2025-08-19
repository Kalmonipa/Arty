import {
  checkHealth,
  cooldownStatus,
  evaluateDepositItemsInBank,
} from "../actions";
import { CharName } from "../constants";
import { logger, sleep } from "../utils";
import {
  getCharacter,
  getCharacterLocation,
  actionMove,
  restCharacter,
} from "../api_calls/Character";
import { getMaps } from "../api_calls/Map";
import { fightMonster, getMonsterInformation } from "../api_calls/Monsters";
import { HealthStatus } from "../types/CharacterData";
import { CharacterSchema } from "../types/types";

export async function beFighter() {
  let character: CharacterSchema = await getCharacter(CharName);

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
      character = restResponse.data.character;
      await sleep(restResponse.data.cooldown.remaining_seconds);
    } //else {
    // Eat food
    //}
  }

  character = await evaluateDepositItemsInBank(character);

  const monsterInfo = await getMonsterInformation({
    query: {
      max_level: character.level,
    },
    url: "/monsters",
  });

  // ToDo: Evaluate which monster to fight from the list based on resistances, health, etc

  logger.info(
    `Intending to fight ${monsterInfo.data[monsterInfo.data.length - 1].name}`,
  );

  const monsterLocations = await getMaps(
    monsterInfo.data[monsterInfo.data.length - 1].code,
    "monster",
  );

  const latestLocation = await getCharacterLocation(character.name);

  let cooldown = cooldownStatus(character);
  if (cooldown.inCooldown) {
    await sleep(cooldown.timeRemaining);
  }
  if (
    latestLocation.x === monsterLocations.data[0].x &&
    latestLocation.y === monsterLocations.data[0].y
  ) {
    logger.info(
      `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
    );
  } else {
    logger.info(
      `Moving to x: ${monsterLocations.data[0].x}, y: ${monsterLocations.data[0].y}`,
    );

    const moveResponse = await actionMove(
      character.name,
      monsterLocations.data[0].x,
      monsterLocations.data[0].y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  logger.info(
    `Fighting ${monsterInfo.data[monsterInfo.data.length - 1].name} at x: ${character.x}, y: ${character.y}`,
  );
  const fightResponse = await fightMonster(character.name);
  logger.info(`Fight was a ${fightResponse.data.fight.result}`);
  character = fightResponse.data.character;
  await sleep(fightResponse.data.cooldown.remaining_seconds);
}
