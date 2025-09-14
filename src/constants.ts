import { getEnv } from './utils';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const CharName = getEnv('CHARACTER_NAME');
export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');

export const MyHeaders = new Headers({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${ApiToken}`,
});
