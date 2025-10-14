import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { ApiError } from './Error.js';
import { getResourceInformation } from '../api_calls/Resources.js';
import { logger } from '../utils.js';
import { ActiveEventSchema } from '../types/types.js';
import { SimpleMapSchema } from '../types/MapData.js';
import { actionGather } from '../api_calls/Actions.js';

/**
 * @description Performs the necessary steps to find and execute an event
 * Currently only supports resource events but will add more
 */
export class EventObjective extends Objective {
  activeEvent: ActiveEventSchema;

  constructor(character: Character, activeEvent: ActiveEventSchema) {
    super(character, `${activeEvent.code}_event`, 'not_started');

    this.character = character;
    this.activeEvent = activeEvent;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
       * {
  "data": [
    {
      "name": "Magic Apparition",
      "code": "magic_apparition",
      "map": {
        "map_id": 910,
        "name": "Forest",
        "skin": "forest_magictree1",
        "x": 9,
        "y": 12,
        "layer": "overworld",
        "access": {
          "type": "standard",
          "conditions": []
        },
        "interactions": {
          "content": {
            "type": "resource",
            "code": "magic_tree"
          },
          "transition": null
        }
      },
      "previous_map": {
        "map_id": 910,
        "name": "Forest",
        "skin": "forest_1",
        "x": 9,
        "y": 12,
        "layer": "overworld",
        "access": {
          "type": "standard",
          "conditions": []
        },
        "interactions": {
          "content": null,
          "transition": null
        }
      },
      "duration": 60,
      "expiration": "2025-10-12T10:01:32.530Z",
      "created_at": "2025-10-12T09:01:32.530Z"
    },
    {
      "name": "Nomadic Merchant",
      "code": "nomadic_merchant",
      "map": {
        "map_id": 382,
        "name": "City",
        "skin": "forest_village2_nomadic_merchant",
        "x": 3,
        "y": 2,
        "layer": "overworld",
        "access": {
          "type": "standard",
          "conditions": []
        },
        "interactions": {
          "content": {
            "type": "npc",
            "code": "nomadic_merchant"
          },
          "transition": null
        }
      },
      "previous_map": {
        "map_id": 382,
        "name": "City",
        "skin": "forest_village2",
        "x": 3,
        "y": 2,
        "layer": "overworld",
        "access": {
          "type": "standard",
          "conditions": []
        },
        "interactions": {
          "content": null,
          "transition": null
        }
      },
      "duration": 60,
      "expiration": "2025-10-12T10:28:31.755Z",
      "created_at": "2025-10-12T09:28:31.755Z"
    }
  ],
  "total": 2,
  "page": 1,
  "size": 50,
  "pages": 1
}
       * 
       */

  async run() {
    return await this.gatherResources(this.activeEvent);
  }

  /**
   * @description Function to respond to resource events
   */
  private async gatherResources(event: ActiveEventSchema) {
    const resourceInfoResponse = await getResourceInformation(
      event.map.interactions.content.code,
    );
    if (resourceInfoResponse instanceof ApiError) {
      if (this.character.handleErrors(resourceInfoResponse)) {
        return;
      } else {
        return false;
      }
    }
    const charSkillLevel = this.character.getCharacterLevel(
      resourceInfoResponse.data.skill,
    );
    const requiredLevel = resourceInfoResponse.data.level;

    if (charSkillLevel < requiredLevel) {
      logger.debug(`Not high enough level for ${event.code}`);
      return;
    }

    const resourceLocation: SimpleMapSchema = {
      x: event.map.x,
      y: event.map.y,
    };

    const expirationTime = new Date(event.expiration).getTime();
    while (Date.now() < expirationTime) {
      await this.character.evaluateGear(resourceInfoResponse.data.skill);

      this.character.move(resourceLocation);

      //const numToGather = this.character.data.inventory_max_items * 0.9;
      const numToGather = 10;

      // Only gathering 10 at a time to avoid attempting to gather after the event is over
      // ToDo: Put retry logic in here instead of just gathering 10 at a time
      for (let count = 0; count < numToGather; count++) {
        if (this.progress % 5 === 0) {
          logger.info(`Gathered ${this.progress}/${numToGather} ${event.code}`);
          // Check inventory space to make sure we are less than 90% full
          await this.character.evaluateDepositItemsInBank([], resourceLocation);
        }

        const response = await actionGather(this.character.data);

        if (response instanceof ApiError) {
          await this.character.handleErrors(response);
          continue;
        } else {
          // Ensure response has the expected structure before accessing nested properties
          if (response && response.data && response.data.character) {
            this.character.data = response.data.character;
            this.progress++; // ToDo There might be edge cases where this doesn't reflect the actual gathered number
          } else {
            logger.error(
              'Invalid response structure from actionGather:',
              response,
            );
            return false;
          }
        }

        if (!await this.checkStatus()) return false;

        await this.character.saveJobQueue();
      }
    }
  }
}
