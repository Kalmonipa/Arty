import { actionMove } from "../api_calls/Character";
import { HealthStatus } from "../types/CharacterData";
import { CharacterSchema, MapSchema } from "../types/types";
import { logger, sleep } from "../utils";

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
  checkHealth(): HealthStatus {
    return {
      percentage: (this.data.hp / this.data.max_hp) * 100,
      difference: this.data.max_hp - this.data.hp,
    };
  }

  /**
   * Checks if the character is in cooldown. Sleep until if finishes if yes
   * @param character
   * @returns {boolean}
   */
  cooldownStatus(): {
    inCooldown: boolean;
    timeRemaining: number;
  } {
    const timestamp = this.data.cooldown_expiration;

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
  evaluateClosestMap(maps: MapSchema[]): MapSchema {
    var closestDistance = 1000000;
    var closestMap: MapSchema;

    maps.forEach((map) => {
      var dist = this.data.x - map.x + (this.data.y - map.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestMap = map;
      }
    });

    logger.info(`Closest map is at x: ${closestMap.x}, y: ${closestMap.y}`);

    return closestMap;
  }

  /**
   * @description moves the character to the destination if they are not already there
   */
  async moveCharacter(targetX: number, targetY: number) {
    if (
        this.data.x === targetX &&
        this.data.y === targetY
      ) {
        logger.info(
          `Already at location x: ${targetX}, y: ${this.data.y}`,
        );
      } else {
        logger.info(
          `Moving to x: ${targetX}, y: ${targetY}`,
        );
    
        const moveResponse = await actionMove(
          this.data.name,
          targetX,
          targetX,
        );
        this.data = moveResponse.data.character;
        await sleep(moveResponse.data.cooldown.remaining_seconds);
      }
  }
}
