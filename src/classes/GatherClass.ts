import { CharacterSchema, SimpleItemSchema } from "../types/types";
import { Character } from "./CharacterClass";
import { Objective } from "./ObjectiveClass";

export class GatherObjective extends Objective {
  constructor(character: Character, target?: SimpleItemSchema) {
    super(character, target);
  }

  gatherItems(character: Character, target: SimpleItemSchema) {
    for (var count; count < target.quantity; count++) {}
  }
}
