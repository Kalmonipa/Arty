import { GatheringSkill, ResourceSchema } from '../types/types.js';

export type ResourceNodeSelection = {
  resource?: ResourceSchema;
  skillNeeded?: GatheringSkill;
  levelNeeded?: number;
};
