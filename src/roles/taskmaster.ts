import {
  checkHealth,
  cooldownStatus,
  evaluateClosestMap,
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
import { completeTask } from "../api_calls/Tasks";

/**
 * Currently only supports Monster tasks
 * ToDo: Implement gathering tasks
 */
export async function beTaskmaster(): Promise<boolean> {
  let character: CharacterSchema = await getCharacter(CharName);

  if (character.task_total === character.task_progress) {
    logger.info(`Task ${character.task} complete`);

    const taskMasterLocation = await getMaps("monsters", "tasks_master").then(
      (locations) => evaluateClosestMap(character, locations.data),
    );

    const latestLocation = await getCharacterLocation(character.name);

    if (
      latestLocation.x === taskMasterLocation.x &&
      latestLocation.y === taskMasterLocation.y
    ) {
      logger.info(
        `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
      );
    } else {
      logger.info(
        `Moving to x: ${taskMasterLocation.x}, y: ${taskMasterLocation.y}`,
      );

      const moveResponse = await actionMove(
        character.name,
        taskMasterLocation.x,
        taskMasterLocation.y,
      );
      character = moveResponse.data.character;
      await sleep(moveResponse.data.cooldown.remaining_seconds);
    }

    const completeTaskResponse = await completeTask(character.name);
    var itemsReceived: string;
    completeTaskResponse.data.rewards.items.forEach(
      (item) => (itemsReceived += item.code),
    );
    logger.info(
      `Received ${itemsReceived} and ${completeTaskResponse.data.rewards.gold} gold for completing task`,
    );
    character = completeTaskResponse.data.character;
    await sleep(completeTaskResponse.data.cooldown.remaining_seconds);
    return true; // Tells the caller to stop all actions because role is complete
  } else {
    logger.info(
      `Killed ${character.task_progress} of ${character.task_total} ${character.task}`,
    );
  }

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

  const monsterLocation = await getMaps(character.task, "monster").then(
    (locations) => evaluateClosestMap(character, locations.data),
  );

  const latestLocation = await getCharacterLocation(character.name);

  let cooldown = cooldownStatus(character);
  if (cooldown.inCooldown) {
    await sleep(cooldown.timeRemaining);
  }
  if (
    latestLocation.x === monsterLocation.x &&
    latestLocation.y === monsterLocation.y
  ) {
    logger.info(
      `Already at location x: ${latestLocation.x}, y: ${latestLocation.y}`,
    );
  } else {
    logger.info(`Moving to x: ${monsterLocation.x}, y: ${monsterLocation.y}`);

    const moveResponse = await actionMove(
      character.name,
      monsterLocation.x,
      monsterLocation.y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  logger.info(
    `Fighting ${character.task} at x: ${character.x}, y: ${character.y}`,
  );
  const fightResponse = await fightMonster(character.name);
  logger.info(`Fight was a ${fightResponse.data.fight.result}`);
  character = fightResponse.data.character;
  await sleep(fightResponse.data.cooldown.remaining_seconds);

  return false; // We want the loop to continue so return false
}
