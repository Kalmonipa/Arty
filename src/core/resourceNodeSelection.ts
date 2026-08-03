import type { Character } from '../character/CharacterClass.js';
import { Algae, Sap } from '../names.js';
import { GatheringSkill, ResourceSchema } from '../types/types.js';

/**
 * Drops that every node yields at the same rate, so a higher level node buys
 * nothing but a longer cooldown
 */
const CHEAPEST_NODE_DROPS = new Set([Algae, Sap]);

export type ResourceNodeSelection = {
  resource?: ResourceSchema;
  skillNeeded?: GatheringSkill;
  levelNeeded?: number;
};

/**
 * Every gathering tool is crafted at weaponcrafting, so gathering levels beyond what
 * the village can build a tool for earn nothing. Past that point the healer should
 * take the fastest node for a flat rate drop rather than the highest one
 */
export function preferLowestNode(
  character: Character,
  code: string,
  skill: GatheringSkill,
): boolean {
  // Before init() has run, assume the village can still out-craft us and keep training
  const fleetWeaponcrafting = character.highestWeaponcraftingLevel ?? Infinity;

  return (
    character.role === 'healer' &&
    CHEAPEST_NODE_DROPS.has(code) &&
    character.getCharacterLevel(character.data, skill) > fleetWeaponcrafting
  );
}

export function selectResourceNode(
  resources: ResourceSchema[],
  character: Character,
  code: string,
): ResourceNodeSelection {
  const byLevel = [...resources].sort((a, b) => a.level - b.level);

  if (byLevel.length === 0) {
    return {};
  }

  const usable = byLevel.filter(
    (resource) =>
      resource.level <=
      character.getCharacterLevel(character.data, resource.skill),
  );

  if (usable.length === 0) {
    return { skillNeeded: byLevel[0].skill, levelNeeded: byLevel[0].level };
  }

  const resource = preferLowestNode(character, code, usable[0].skill)
    ? usable[0]
    : usable[usable.length - 1];

  return {
    resource,
    skillNeeded: resource.skill,
    levelNeeded: resource.level,
  };
}
