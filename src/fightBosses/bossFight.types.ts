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

export type BossFightStatus = 'in_progress' | 'complete' | 'aborted';

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
