export interface BossFightParticipantsRow {
  ight_id: number;
  character_name: string;
  role: string;
  state: string;
  reason: string | null;
  updated_at: Date;
}

export type ParticipantStatus = 'ready' | 'unready' | 'completed' | 'accepted';
