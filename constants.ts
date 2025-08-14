import { getEnv } from './utils'
import dotenv from 'dotenv'; 

dotenv.config({quiet: false});

export const charName = "LongLegLarry";
export const ApiUrl = `https://api.artifactsmmo.com`;
export const ApiToken = getEnv('API_TOKEN');

export const MyHeaders = new Headers({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Bearer ${ApiToken}`,
});
