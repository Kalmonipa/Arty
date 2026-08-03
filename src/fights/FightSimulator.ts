import { fightSimulator } from '../api_calls/Actions.js';
import { FakeCharacterSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

/**
 * @description Simulates fights against the target mob using the ArtifactsMMO provided fight sim
 * @returns true if the sim was a win, false if it was a loss
 */
export class FightSimulator extends Objective {
  mockCharacters: FakeCharacterSchema[];
  targetMobCode: string;
  iterations: number;
  /** Average turns across the winning simulations; 0 if none were won */
  averageTurns: number = 0;
  /** Percentage of simulations won */
  winRate: number = 0;

  constructor(
    character: Character,
    mockCharacters: FakeCharacterSchema[],
    targetMobCode: string,
    iterations?: number,
  ) {
    super(character, `fight_sim_${targetMobCode}`, 'not_started');
    this.jobFlavour = 'FightSimulator';
    this.mockCharacters = mockCharacters;
    this.targetMobCode = targetMobCode;
    this.iterations = iterations ?? 10;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async run(): Promise<ObjectiveResult> {
    logger.debug(
      `Simulating ${this.iterations} fights vs ${this.targetMobCode} with ${JSON.stringify(this.mockCharacters)}`,
    );

    const fightSimResponse = await fightSimulator(
      this.mockCharacters,
      this.targetMobCode,
      this.iterations,
    );
    if (fightSimResponse instanceof ApiError) {
      this.character.handleErrors(fightSimResponse);
      return ObjectiveFailed;
    }

    let totalTurns = 0;
    for (const fight of fightSimResponse.data.results) {
      if (fight.result === 'win') {
        totalTurns += fight.turns;
      }
    }
    const averageTurns =
      fightSimResponse.data.wins > 0
        ? totalTurns / fightSimResponse.data.wins
        : 0;
    this.averageTurns = averageTurns;
    this.winRate = fightSimResponse.data.winrate;

    logger.info(
      `Fight sim showed a ${fightSimResponse.data.winrate}% win rate (${fightSimResponse.data.wins}/${this.iterations}) with ${averageTurns} avg turns per fight`,
    );

    if (fightSimResponse.data.winrate >= 80) {
      return ObjectiveCompleted;
    } else {
      return ObjectiveFailed;
    }
  }
}
