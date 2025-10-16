import { actionFight } from '../api_calls/Actions.js';
import { getMaps } from '../api_calls/Maps.js';
import { logger } from '../utils.js';
import { Character } from './Character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../api_calls/Character.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { pauseCharacter } from '../api_calls/Account.js';

export class FightBossLeaderObjective extends Objective {
  target: ObjectiveTargets;
  participants?: string[];
  runFightSim?: boolean;
  participant1Ready = false;
  participant2Ready = false;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
  ) {
    super(character, `fight_${target.quantity}_${target.code}`, 'not_started');

    this.character = character;
    this.target = target;
    this.participants = participants;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    await this.character.evaluateDepositItemsInBank(
      [this.target.code, this.character.preferredFood],
      { x: this.character.data.x, y: this.character.data.y },
    );

    return await this.character.evaluateGear('combat', this.target.code);
  }

  /**
   * @description Fight the requested amount of boss mobs
   * - Finds the best candidates to participate in the fight (i.e highest level characters)
   * - Pause their current activity
   * - Triggers a FightBossParticipant objective in their queue
   * - Wait until they have sent a notification back saying they're ready
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
      const leaderFakeCharSchema = this.createFakeCharacterSchema(
        this.character.data,
      );
      const part1FakeCharSchema = this.createFakeCharacterSchema(
        participants[0],
      );
      const part2FakeCharSchema = this.createFakeCharacterSchema(
        participants[1],
      );

      const simResult = await this.character.simulateFightNow(
        [leaderFakeCharSchema, part1FakeCharSchema, part2FakeCharSchema],
        this.target.code,
      );

      if (!simResult) {
        return false;
      }

      logger.info(
        `Pausing ${participants[0].name} and ${participants[1].name}`,
      );
      await pauseCharacter(participants[0].name);
      await pauseCharacter(participants[1].name);

      // Create partiicpant jobs
      // Create route to initiate the jobs
      // Create route for participants to notify the leader that they're ready
      // Initiate fight
    }
  }

  /**
   * @description Looks at all our characters and finds the 2 other best characters to fight alongside
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

    for (const char of allChars) {
      if (part1 === undefined) {
        part1 = char;
      } else if (part2 === undefined) {
        part2 = char;
      }

      if (char.level > part1.level) {
        logger.info(
          `${char.name} [${char.level}] is higher level than ${part1.name} [${part1.level}]`,
        );
        part1 = char;
      } else if (char.level > part2.level) {
        logger.info(
          `${char.name} [${char.level}] is higher level than ${part2.name} [${part2.level}]`,
        );
        part2 = char;
      }
    }

    return [part1, part2];
  }

  /**
   * @description Creates a FakeCharacterSchema of the current character
   */
  private createFakeCharacterSchema(
    character: CharacterSchema,
  ): FakeCharacterSchema {
    const fakeChar: FakeCharacterSchema = {
      level: character.level,
      // Using the current characters weapon here because the other character might be wearing a gathering weapon
      weapon_slot: this.character.data.weapon_slot,
      rune_slot: character.rune_slot,
      shield_slot: character.shield_slot,
      helmet_slot: character.helmet_slot,
      body_armor_slot: character.body_armor_slot,
      leg_armor_slot: character.leg_armor_slot,
      boots_slot: character.boots_slot,
      ring1_slot: character.ring1_slot,
      ring2_slot: character.ring2_slot,
      amulet_slot: character.amulet_slot,
      artifact1_slot: character.artifact1_slot,
      artifact2_slot: character.artifact2_slot,
      artifact3_slot: character.artifact3_slot,
      utility1_slot: character.utility1_slot,
      utility2_slot: character.utility2_slot,
    };
    if (character.utility1_slot) {
      fakeChar.utility1_slot_quantity = character.utility1_slot_quantity;
    }
    if (character.utility2_slot) {
      fakeChar.utility2_slot_quantity = character.utility2_slot_quantity;
    }
    logger.debug(JSON.stringify(fakeChar));
    return fakeChar;
  }
}
