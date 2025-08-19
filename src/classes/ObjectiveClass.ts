import { getMaps } from "../api_calls/Maps";
import { ApiUrl, MyHeaders } from "../constants";
import { HealthStatus } from "../types/CharacterData";
import {
  CharacterSchema,
  GetAllMapsMapsGetResponse,
  MapSchema,
  SimpleItemSchema,
} from "../types/types";
import { logger } from "../utils";
import { Character } from "./CharacterClass";

export class Objective {
  character: Character;
  target?: SimpleItemSchema;

  constructor(character: Character, target?: SimpleItemSchema) {
    this.character = character;
    this.target = target;
  }

  async findObjectiveLocations(): Promise<MapSchema[]> {
    var contentCode: string;
    if (this.target.code) {
      contentCode = this.target.code;
    }
    return (await getMaps(contentCode)).data;
  }
}
