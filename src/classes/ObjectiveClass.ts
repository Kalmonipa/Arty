import { HealthStatus } from "../types/CharacterData";
import { CharacterSchema, SimpleItemSchema } from "../types/types";
import { logger } from "../utils";

export class Objective {
  requirements?: SimpleItemSchema;

  constructor(requirements?: SimpleItemSchema) {
    requirements = this.requirements
  }

}
