import { ObjectiveResult } from '../types/ObjectiveData.js';
import { FakeCharacterSchema } from '../types/types.js';

export interface BossFightParticipantsRow {
  fight_id: number;
  character_name: string;
  role: string;
  state: string;
  reason: string | null;
  updated_at: Date;
}

/**
 * ready = participant is ready to fight
 *          - equipped all gear for mob
 *          - has food & potions
 *          - standing on the correct map
 * unready = preparing for the fight
 * acknowledged = acknowledgement that the fight sequence is complete. Terminal:
 *          the row is kept as the record of the fight rather than deleted, and
 *          the character is never enlisted back into it.
 */
export type ParticipantStatus = 'ready' | 'unready' | 'acknowledged';

export const BossFightUnready = 'unready' as const satisfies ParticipantStatus;
export const BossFightReady = 'ready' as const satisfies ParticipantStatus;
export const BossFightAcked =
  'acknowledged' as const satisfies ParticipantStatus;

export type BossFightStatus = 'in_progress' | 'complete' | 'aborted';

export type BossFightRole = 'tank' | 'dps' | 'healer';

export const BossFightTank = 'tank' as const satisfies BossFightRole;
export const BossFightDps = 'dps' as const satisfies BossFightRole;
export const BossFightHealer = 'healer' as const satisfies BossFightRole;

/**
 * Defines each boss fight participant
 */
export type BossFightParticipant = {
  characterName: string;
  role: BossFightRole;
};

/**
 * @description The fight a character has been called up to, and the role it was
 * registered under. The role decides which party-wide potion it brings, so it
 * has to travel with the fight id rather than being guessed at the call site.
 */
export type BossFightEnlistment = {
  fightId: number;
  role: BossFightRole;
};

/**
 * @description The verdict on a boss fight plus the numbers behind it. A bare
 * win/loss can't tell you whether the party was one gear tier short or nowhere
 * near, so the sim's own figures travel with it.
 */
export type BossFightSimResult = ObjectiveResult & {
  /** Percentage of simulated fights won */
  winRate: number;
  /** Average turns across the winning simulations; 0 if none were won */
  averageTurns: number;
  /** The loadouts the fight was simulated with, leader first */
  loadouts: FakeCharacterSchema[];
};
