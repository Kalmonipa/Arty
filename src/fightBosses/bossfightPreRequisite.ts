import { requestLoadout } from '../api_calls/Account.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { getMyCharacters } from '../character/character.apiCalls.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/Error.js';
import {
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { CharacterSchema, FakeCharacterSchema } from '../types/types.js';
import { logger } from '../utils.js';
import { FightSimulator } from '../fights/fight.simulator.js';
import {
  BossFightLeaderRole,
  BossFightParticipant,
  BossFightRole,
  BossFightRoster,
  BossFightSimResult,
  MaxBossFightParty,
} from './bossFight.types.js';
import { resolveGearPlan } from '../evaluateGear/gearPlan.js';

/**
 * A lot of these functions are also used by RaidObjective because they are kind of the same procedure
 * Raid specific functions are in the fightRaids folder to avoid crossing over too much
 */

/**
 * A verdict with nothing behind it, for the paths that never reach the sim
 * Sets -1 so that it's obvious it is a failure rather than a quick fight
 */
function noSimResult(result: ObjectiveResult): BossFightSimResult {
  return { ...result, winRate: -1, averageTurns: -1, loadouts: [] };
}

/**
 * @param options.roster who fights alongside the leader, and in what part.
 * Defaults to the boss fight roster; a raid passes its own all-tank one.
 * @param options.leaderRole the part the leader plays. Separate from the roster,
 * which never includes the leader.
 * @param options.winRateThreshold how sure the sim has to be before committing.
 */
export async function simulateBossFight(
  character: Character,
  target: ObjectiveTargets,
  options?: {
    roster?: BossFightParticipant[];
    leaderRole?: BossFightRole;
    winRateThreshold?: number;
  },
): Promise<BossFightSimResult> {
  const roster = options?.roster ?? BossFightRoster;
  const leaderRole = options?.leaderRole ?? BossFightLeaderRole;

  const mobInfo = await getMonsterInformation(target.code);
  if (mobInfo instanceof ApiError) {
    await character.handleErrors(mobInfo);
    return noSimResult(ObjectiveFailed);
  }

  const participants = await findBestParticipants(character, roster);
  if (!participants) {
    logger.warn(`No participants found for fight against ${target.code}`);
    return noSimResult(ObjectiveFailed);
  }

  const participantLoadouts: FakeCharacterSchema[] = [];

  for (const [index, participant] of participants.entries()) {
    const { role } = roster[index];

    const loadoutRequest = await requestLoadout(
      participant.name,
      mobInfo.data.code,
      role,
    );

    if (loadoutRequest instanceof ApiError) {
      logger.warn(
        `Failed to get loadout for ${participant.name}: ${loadoutRequest.error.message}. Building my own`,
      );
      // A locally built schema carries no potions, since only the participant
      // can see its own inventory and bank
      participantLoadouts.push(
        character.createFakeCharacterSchema(participant),
      );
      continue;
    }

    logger.info(
      `Successfully received ${role} loadout from ${participant.name}`,
    );
    participantLoadouts.push(loadoutRequest.proposedLoadout);
  }

  // The participants' parts are settled the moment the leader's is, so their
  // loadouts are fetched once and reused across every variant. Only the leader's
  // own allocation is an open question, which is what the variants explore.
  const plan = resolveGearPlan({
    monster: mobInfo.data,
    role: leaderRole,
    partySize: MaxBossFightParty,
  });

  let best: BossFightSimResult | undefined;

  for (const variant of plan.variants) {
    // The leader proposes its own loadout the same way the participants do: this
    // runs before anyone gears up, so simulating the gear it happens to be
    // standing in would judge the fight on a gathering tool
    const leaderFakeCharSchema = await character.proposeCombatLoadout(
      target.code,
      undefined,
      leaderRole,
      variant.name,
    );

    const loadouts = [leaderFakeCharSchema, ...participantLoadouts];

    // Owning the job rather than going through simulateFightNow is what keeps
    // the win rate and turn count reachable; the helper returns only a pass/fail
    const sim = new FightSimulator(
      character,
      loadouts,
      target.code,
      target.quantity,
      { winRateThreshold: options?.winRateThreshold },
    );
    const simResult = await character.executeJobNow(
      sim,
      true,
      true,
      character.currentExecutingJob?.objectiveId,
    );

    logger.info(
      `Sim result for the ${variant.name} variant was a ${simResult.success ? 'win' : 'loss'} at a ${sim.winRate}% win rate over ${sim.averageTurns} turns`,
    );

    const candidate: BossFightSimResult = {
      ...simResult,
      winRate: sim.winRate,
      averageTurns: sim.averageTurns,
      loadouts,
      variant: variant.name,
    };

    if (!best || candidate.winRate > best.winRate) {
      best = candidate;
    }

    // A variant that already clears the bar is good enough. Simulating the rest
    // would only spend the shared request budget to refine a decision already
    // made, and the sim endpoint is rate limited to roughly one call a second.
    if (simResult.success) {
      break;
    }
  }

  return best ?? noSimResult(ObjectiveFailed);
}

/**
 * @description Gets the character schemas for JumpyJimmy and BouncyBella. Hardcoded for now
 * @todo Expand this to choose the supporting participants dynamically
 * @returns An array of the character schemas of the 2 participants
 */
async function findBestParticipants(
  char: Character,
  roster: BossFightParticipant[],
): Promise<CharacterSchema[]> {
  const allChars = await getMyCharacters();
  if (allChars instanceof ApiError) {
    await char.handleErrors(allChars);
    return [];
  }

  return roster.map((member) =>
    allChars.find((char) => char.name === member.characterName),
  );

  // let part1: CharacterSchema;
  // let part2: CharacterSchema;

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
