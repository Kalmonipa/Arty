import { Skill } from './types.js';

export interface EventRule {
  id: number; // SERIAL maps to number
  event_code: string; // TEXT maps to string
  character: string | null; // Nullable in DB
  skill: Skill | 'combat' | null; // Nullable in DB
  min_level: number | null; // INT maps to number, nullable
  max_level: number | null; // INT maps to number, nullable
  ignore: boolean; // BOOLEAN maps to boolean
}
