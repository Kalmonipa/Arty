import { Character } from './Character.js';
import { Objective } from './Objective.js';
import { ApiError } from './Error.js';
import { getResourceInformation } from '../api_calls/Resources.js';
import { logger } from '../utils.js';
import {
  ActiveEventSchema,
  DestinationSchema,
  MapSchema,
} from '../types/types.js';
import { actionFight, actionGather } from '../api_calls/Actions.js';
import { getMapsById } from '../api_calls/Maps.js';

/**
 * @description Performs the necessary steps to complete an achievement
 */
export class AchievementObjective extends Objective {
  activeEvent: ActiveEventSchema;
  /**
   * @description The location of the character before the event started.
   * This is used to move back to once the event expires, to resume prior activities
   */
  previousLocation: MapSchema;

  constructor(
    character: Character,
    activeEvent: ActiveEventSchema,
    previousLocation?: MapSchema,
  ) {
    super(character, `${activeEvent.code}_event`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Event';
    this.activeEvent = activeEvent;
    if (previousLocation) {
      this.previousLocation = previousLocation;
    } else {
      this.previousLocation = this.character.allMaps.find(
        (map) => map.map_id === this.character.data.map_id,
      );
    }
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run() {
    return true;
  }
}