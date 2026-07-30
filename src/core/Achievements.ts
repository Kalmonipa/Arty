import { Character } from '../character/characterClass.js';
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
  achievementName: string;

  constructor(character: Character, achievementName: string) {
    super(character, `achievement_${achievementName}`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Event';
    this.achievementName = achievementName;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    // Check if the achievement is completed
    return true;
  }

  async run() {
    /**
     * 1. Get achievement requirements (start with gathering achievements)
     * 2. Fullfill gathering task on a loop, checking if we've completed the achievement after each loop
     *    This shouldn't need an API call each time.
     * 3. When we think it's complete, check against the API to ensure
     */
    return true;
  }
}
