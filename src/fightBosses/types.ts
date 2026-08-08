export interface BossFightParticipantsRow {
  ight_id: number;
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
 * acknowledged = acknowledgement that the fight sequence is complete
 */
export type ParticipantStatus = 'ready' | 'unready' | 'acknowledged';
