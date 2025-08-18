import { getCharacter } from "../api_calls/Character";
import { HealthStatus } from "../types/CharacterData";
import { CharacterSchema, MapSchema, SimpleItemSchema } from "../types/types";
import { logger } from "../utils";

class Character {
    name: string;
    data: CharacterSchema;

    constructor(name: string) {
        name = this.name;
        // Do something
    }

  /**
   * Returns the percentage of health we have and what is needed to get to 100%
   * @param character
   */
  checkHealth(character: CharacterSchema): HealthStatus {
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
  cooldownStatus(character: CharacterSchema): {
    inCooldown: boolean;
    timeRemaining: number;
  } {
    const timestamp = character.cooldown_expiration;
  
    const targetDate = new Date(timestamp);
  
    const now = new Date();
  
    if (now > targetDate) {
      return { inCooldown: false, timeRemaining: 0 };
    } else {
      const timeToWait =
        Math.floor((targetDate.getTime() - now.getTime()) / 1000) + 2;
      logger.info(
        `Cooldown is still ongoing. Waiting for ${timeToWait} seconds until ${timestamp}`,
      );
      return {
        inCooldown: true,
        timeRemaining: timeToWait,
      };
    }
  }

  /**
   * @description Finds the closest map based on manhattan distance from current location
   */
  evaluateClosestMap(
    character: CharacterSchema,
    maps: MapSchema[],
  ): MapSchema {
    var closestDistance = 1000000;
    var closestMap: MapSchema;
  
    maps.forEach((map) => {
      var dist = character.x - map.x + (character.y - map.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestMap = map;
      }
    });
  
    logger.info(`Closest map is at x: ${closestMap.x}, y: ${closestMap.y}`);
  
    return closestMap;
  }
}
