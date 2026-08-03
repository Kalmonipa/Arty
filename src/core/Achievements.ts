import { Character } from '../character/CharacterClass.js';
import { Objective } from './Objective.js';
import { ObjectiveResult } from '../types/ObjectiveData.js';

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

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    // Check if the achievement is completed
    return { complete: true, success: true, reason: 'complete' };
  }

  async run(): Promise<ObjectiveResult> {
    /**
     * 1. Get achievement requirements (start with gathering achievements)
     * 2. Fullfill gathering task on a loop, checking if we've completed the achievement after each loop
     *    This shouldn't need an API call each time.
     * 3. When we think it's complete, check against the API to ensure
     */
    return { complete: true, success: true, reason: 'complete' };
  }
}
