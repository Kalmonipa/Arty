import { depositItems } from "./api_calls/Bank";
import { moveCharacter } from "./api_calls/Character";
import { getAllItemInformation } from "./api_calls/Items";
import { getContentLocation } from "./api_calls/Map";
import { MaxInventorySlots } from './constants'
import { logger, sleep } from "./utils";
import { HealthStatus } from "./types/CharacterData";
import {
  BankItemTransactionSchema,
  CharacterSchema,
  CraftingSchema,
  CraftSkill,
  GetAllItemsItemsGetData,
  SimpleItemSchema,
} from "./types/types";

/**
 * Returns the percentage of health we have and what is needed to get to 100%
 * @param character
 */
export function checkHealth(character: CharacterSchema): HealthStatus {
  return {
    percentage: (character.hp / character.max_hp) * 100,
    difference: character.max_hp - character.hp,
  };
}

/**
 * Checks if the character is in cooldown. Sleep until if finishes if yes
 * @param character
 * @returns {boolean}
 */
export function cooldownStatus(character: CharacterSchema): {
  inCooldown: boolean;
  timeRemaining: number;
} {
  const timestamp = character.cooldown_expiration;

  const targetDate = new Date(timestamp);

  const now = new Date();

  if (now > targetDate) {
    return { inCooldown: false, timeRemaining: 0 };
  } else {
    logger.info(
      `Cooldown is still ongoing. Waiting for ${Math.floor((targetDate.getTime() - now.getTime()) / 1000)} seconds until ${timestamp}`,
    );
    return {
      inCooldown: true,
      timeRemaining: Math.floor((targetDate.getTime() - now.getTime()) / 1000),
    };
  }
}

export async function findBankAndDepositItems(
  character: CharacterSchema,
): Promise<BankItemTransactionSchema> {
  // ToDo: Implement a function to find the closest map.
  // Currently we just go to the first one
  const bankLocations = (await getContentLocation("bank")).data;
  logger.info(
    `Found bank at x: ${bankLocations[0].x}, y: ${bankLocations[0].y}`,
  );

  if (
    character.x === bankLocations[0].x &&
    character.y === bankLocations[0].y
  ) {
    logger.info(`Already at location x: ${character.x}, y: ${character.y}`);
  } else {
    logger.info(`Moving to x: ${bankLocations[0].x}, y: ${bankLocations[0].y}`);
    const moveResponse = await moveCharacter(
      character.name,
      bankLocations[0].x,
      bankLocations[0].y,
    );
    character = moveResponse.data.character;
    await sleep(moveResponse.data.cooldown.remaining_seconds);
  }

  var itemsToDeposit: SimpleItemSchema[] = [];

  for (var i = 0; i < character.inventory.length; i++) {
    // logger.info(
    //   `${character.inventory[i].code}: ${character.inventory[i].quantity}`,
    // );
    if (character.inventory[i].code !== "") {
      itemsToDeposit.push({
        code: character.inventory[i].code,
        quantity: character.inventory[i].quantity,
      });
    }
  }

  try {
    const depositResponse = await depositItems(character.name, itemsToDeposit);
    return depositResponse;
  } catch (error) {
    logger.error(`Deposit failed: ${error}`);
  }
}

/**
 * Returns what percentage of the backpack is full
 * @param char Character info to parse
 */
export function getInventoryFullness(char: CharacterSchema): number {
  var usedSpace = 0;
  char.inventory.forEach((invSlot) => {
    usedSpace += invSlot.quantity;
  });

  return (usedSpace / char.inventory_max_items) * 100;
}

/**
 * @description Evaluates whether character has the ingredients to craft something
 * @returns {CraftingSchema}
 */
export async function evaluateCraftingWithCurrentInventory(
  character: CharacterSchema,
  characterLevel: number,
  craftingSkill: CraftSkill,
): Promise<CraftingSchema[]> {
  if (character.inventory.length === 0) {
    logger.warn(`${character.name} has no inventory items to craft with`);
    return [];
  }

  const getAllItemsParams: GetAllItemsItemsGetData = {
    query: {
      craft_skill: craftingSkill,
      max_level: characterLevel,
    },
    url: "/items",
  };

  const response = await getAllItemInformation(getAllItemsParams);
  if (response.data.length === 0) {
    logger.warn("Not able to craft anything");
    return [];
  }

  const itemsNeeded: CraftingSchema[] = [];

  for (
    var targetItemInd = 0;
    targetItemInd < response.data.length;
    targetItemInd++
  ) {
    //logger.warn(`Target item index: ${targetItemInd}`)

    const neededSourceItems = response.data[targetItemInd].craft.items;
    //logger.info(neededSourceItems)

    for (
      var sourceItemInd = 0;
      sourceItemInd < neededSourceItems.length;
      sourceItemInd++
    ) {
      //logger.warn(`Source item index: ${sourceItemInd}`)
      for (var invItemsInd = 0; invItemsInd < MaxInventorySlots; invItemsInd++) {
        //logger.warn(`Inv item index: ${invItemsInd}`)
        if (
          neededSourceItems[sourceItemInd].code ===
            character.inventory[invItemsInd].code &&
          neededSourceItems[sourceItemInd].quantity <=
            character.inventory[invItemsInd].quantity &&
          Math.trunc(
            character.inventory[invItemsInd].quantity /
              neededSourceItems[sourceItemInd].quantity,
          ) > 0
        ) {
          logger.info(`Item ${neededSourceItems[sourceItemInd].code} can be crafted into ${response.data[targetItemInd].code}`)
          itemsNeeded.push({
            code: response.data[targetItemInd].code,
            // We want to return the number of items we can craft
            // e.g. if an item requires 4 of a resouce, and we have 14
            // we can only craft 3 items
            quantity: Math.trunc(
              character.inventory[invItemsInd].quantity /
                neededSourceItems[sourceItemInd].quantity,
            ),
          });
        }
      }
    }
  }

  return itemsNeeded
  //itemsNeeded.forEach(function (craftingSchema) {
}

/**
 * @description Check if char needs to visit the bank and deposit items
 */
export async function evaluateDepositItemsInBank(
  character: CharacterSchema,
): Promise<CharacterSchema> {
  let usedInventorySpace = getInventoryFullness(character);
  if (usedInventorySpace >= 90) {
    logger.warn(`Inventory is almost full. Depositing items`);
    const depositResponse = await findBankAndDepositItems(character);
    character = depositResponse.character;
    await sleep(depositResponse.cooldown.remaining_seconds);
  } else {
    logger.info(
      `Backpack: ${usedInventorySpace}/${character.inventory_max_items}`,
    );
  }
  return character;
}
