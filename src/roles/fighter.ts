import { checkHealth, cooldownStatus, findClosestBankAndDepositItems, getInventorySpace } from "../actions";
import { CharName } from "../constants";
import { logger, sleep } from "../utils";
import { getCharacter, getCharacterLocation, moveCharacter, restCharacter } from "../api_calls/Character";
import { getContentLocation } from '../api_calls/Map'
import { fightMonster, getMonsterInformation } from '../api_calls/Monsters'
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
      character = restResponse.data.character;
      await sleep(restResponse.data.cooldown.remaining_seconds)
    } //else {
    // Eat food
    //}
  }

    let usedInventorySpace = getInventorySpace(character);
    if (usedInventorySpace >= 90) {
      logger.warn(`Inventory is almost full. Depositing items`);
      const depositResponse = await findClosestBankAndDepositItems(character);
      character = depositResponse.character;
      await sleep(depositResponse.cooldown.remaining_seconds);
    } else {
      logger.info(
        `Backpack: ${usedInventorySpace}/${character.inventory_max_items}`,
      );
    }

  const monsterInfo = await getMonsterInformation({
    max_level: character.fishing_level,
  });

  const monsterLocations = await getContentLocation(
    monsterInfo.data[monsterInfo.data.length - 1].code,
    'monster',
  );

    const latestLocation = await getCharacterLocation(character.name);
  
    let cooldown = cooldownStatus(character);
    if (cooldown.inCooldown) {
      await sleep(cooldown.timeRemaining);
    } else {
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
  
        const moveResponse = await moveCharacter(
          character.name,
          monsterLocations.data[0].x,
          monsterLocations.data[0].y,
        );
        character = moveResponse.data.character;
        await sleep(moveResponse.data.cooldown.remaining_seconds);
      }
    }
  
    logger.info(`Fighting monster at x: ${character.x}, y: ${character.y}`);
    const fightResponse = await fightMonster(CharName);
    logger.info(`Fight was a ${fightResponse.data.fight.result}`)
    //logger.info(fightResponse.data)
    character = fightResponse.data.character;
    await sleep(fightResponse.data.cooldown.remaining_seconds);
}
