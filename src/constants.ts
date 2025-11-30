import { Role } from './types/CharacterData.js';
import { getEnv } from './utils.js';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const AllCharNames = [
  'LongLegLarry',
  'JumpyJimmy',
  'ZippyZoe',
  'TimidTom',
  'BouncyBella',
];

export const CharName = getEnv('CHARACTER_NAME');
export const CharRole = getEnv('ROLE').toLowerCase() as Role;
export const MAX_COMBAT_LEVEL = 50;
export const MAX_SKILL_LEVEL = 50;
export const CRITICAL_MODIFIER = 0.5;

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');
