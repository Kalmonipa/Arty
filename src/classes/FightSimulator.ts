import { fightSimulator } from '../api_calls/Actions.js';
import { FakeCharacterSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';

/**
 * @description Simulates fights against the target mob using the ArtifactsMMO provided fight sim
 * @returns true if the sim was a win, false if it was a loss
 */
export class FightSimulator extends Objective {
  mockCharacters: FakeCharacterSchema[];
  targetMobCode: string;
  iterations: number;
  debugLogs: boolean = true;

  constructor(
    character: Character,
    mockCharacters: FakeCharacterSchema[],
    targetMobCode: string,
    iterations?: number,
    debugLogs?: boolean,
  ) {
    super(character, `fight_sim_${targetMobCode}`, 'not_started');
    this.mockCharacters = mockCharacters;
    this.targetMobCode = targetMobCode;
    this.iterations = iterations !== undefined ? iterations : 10;
    this.debugLogs = debugLogs;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    const fightSimResponse = await fightSimulator(
      this.mockCharacters,
      this.targetMobCode,
      this.iterations,
    );
    if (fightSimResponse instanceof ApiError) {
      this.character.handleErrors(fightSimResponse);
      return false;
    }

    let totalTurns = 0;
    for (const fight of fightSimResponse.data.results) {
      if (fight.result === 'win') {
        totalTurns += fight.turns;
      }
    }
    const averageTurns = totalTurns / fightSimResponse.data.wins;

    logger.info(
      `Fight sim showed a ${fightSimResponse.data.winrate}% win rate (${fightSimResponse.data.wins}/${this.iterations}) with ${averageTurns} avg turns per fight`,
    );

    if (fightSimResponse.data.winrate > 90) {
      return true;
    } else {
      return false;
    }
  }
}
