import { actionFight } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';

export class FightBossParticipantObjective extends Objective {
  bossName: string;

  constructor(character: Character, bossName: string, parentObjective: string) {
    super(character, `fight_boss_${bossName}`, 'not_started');

    this.character = character;
    this.bossName = bossName;
    this.parentId = parentObjective;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Get prepared for the fight and send a notification to the leader to say they're ready
   */
  async run(): Promise<boolean> {
    return true;
  }
}
