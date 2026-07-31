import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../character/apiCalls.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { requestLoadout } from '../api_calls/Account.js';
import { BouncyBella, JumpyJimmy } from '../constants.js';

export class FightBossLeaderObjective extends Objective {
  target: ObjectiveTargets;
  runFightSim?: boolean;
  participant1Ready = false;
  participant2Ready = false;

  constructor(character: Character, target: ObjectiveTargets) {
    super(
      character,
      `lead_bossfight_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'LeadBossFight';
    this.target = target;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Fight the requested amount of boss mobs
   * - Finds the best candidates to participate in the fight (Currently hardcoded to JumpyJimmy and BouncyBella)
   * - Get a loadout from each participant and build a FakeCharacterSchema for each
   * - Simulate the fight to see if we can win
   * - Wait until they have updated a row in their table to say theyr're ready
   * - Initiate the fight x amount of times
   * - Resume the participants activities so they can go back to what they were doing
   */
  async run(): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      if (!(await this.checkStatus())) return false;

      const mobInfo = await getMonsterInformation(this.target.code);
      if (mobInfo instanceof ApiError) {
        return this.character.handleErrors(mobInfo);
      }

      const participants = await this.findBestParticipants();
      if (!participants) {
        logger.warn(
          `No participants found for fight against ${this.target.code}`,
        );
        return false;
      }

      // Build FakeCharacterSchemas to run a fight sim
      const leaderFakeCharSchema = this.character.createFakeCharacterSchema(
        this.character.data,
      );
      let part1FakeCharSchema: FakeCharacterSchema;
      let part2FakeCharSchema: FakeCharacterSchema;

      let part1FakeCharSchemaRequest = await requestLoadout(
        participants[0].name,
        mobInfo.data.code,
      );
      if (part1FakeCharSchemaRequest instanceof ApiError) {
        logger.warn(
          `Failed to get loadout for ${participants[0].name}: ${part1FakeCharSchemaRequest.error.message}. Building my own`,
        );
        part1FakeCharSchema = this.character.createFakeCharacterSchema(
          participants[0],
        );
      } else {
        logger.info(
          `Successfully received loadout from ${participants[1].name}`,
        );
        part1FakeCharSchema = part1FakeCharSchemaRequest.proposedLoadout;
      }
      const part2FakeCharSchemaRequest = await requestLoadout(
        participants[1].name,
        mobInfo.data.code,
      );
      if (part2FakeCharSchemaRequest instanceof ApiError) {
        logger.warn(
          `Failed to get loadout for ${participants[1].name}: ${part2FakeCharSchemaRequest.error.message}. Building my own`,
        );
        part2FakeCharSchema = this.character.createFakeCharacterSchema(
          participants[1],
        );
      } else {
        logger.info(
          `Successfully received loadout from ${participants[1].name}`,
        );
        part2FakeCharSchema = part2FakeCharSchemaRequest.proposedLoadout;
      }

      const simResult = await this.character.simulateFightNow(
        [leaderFakeCharSchema, part1FakeCharSchema, part2FakeCharSchema],
        this.target.code,
      );

      logger.info(`Sim result was a ${simResult ? 'win' : 'loss'}`);
    }
  }

  /**
   * @description Gets the character schemas for JumpyJimmy and BouncyBella. Hardcoded for now
   * @todo Expand this to choose the supporting participants dynamically
   * @returns An array of the character schemas of the 2 participants
   */
  private async findBestParticipants(): Promise<CharacterSchema[]> {
    let part1: CharacterSchema;
    let part2: CharacterSchema;

    const allChars = await getMyCharacters();
    if (allChars instanceof ApiError) {
      await this.character.handleErrors(allChars);
      return [];
    }

    return [
      allChars.find((char) => char.name === BouncyBella),
      allChars.find((char) => char.name === JumpyJimmy),
    ];

    // for (const char of allChars) {
    //   if (part1 === undefined) {
    //     part1 = char;
    //   } else if (part2 === undefined) {
    //     part2 = char;
    //   }

    //   if (char.level > part1.level) {
    //     logger.info(
    //       `${char.name} [${char.level}] is higher level than ${part1.name} [${part1.level}]`,
    //     );
    //     part1 = char;
    //   } else if (char.level > part2.level) {
    //     logger.info(
    //       `${char.name} [${char.level}] is higher level than ${part2.name} [${part2.level}]`,
    //     );
    //     part2 = char;
    //   }
    // }

    //return [part1, part2];
  }
}
