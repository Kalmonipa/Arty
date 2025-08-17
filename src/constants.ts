import { getEnv } from "./utils";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const CharName = getEnv("CHARACTER_NAME");
export const ApiUrl = `https://api.artifactsmmo.com`;
export const ApiToken = getEnv("API_TOKEN");
export const MaxInventorySlots = 20;

export const MyHeaders = new Headers({
  "Content-Type": "application/json",
  Accept: "application/json",
  Authorization: `Bearer ${ApiToken}`,
});
