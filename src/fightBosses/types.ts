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
