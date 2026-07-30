import { Objective } from '../core/Objective.js';
import { ObjectiveStatus } from './ObjectiveData.js';

/**
 * @param percentage The percentage of health we are currently on
 * @param difference The amount needed to get to 100%
 */
export type HealthStatus = {
  percentage: number;
  difference: number;
};

export type InventorySlot = {
  slot: number;
  code: string;
  quantity: number;
};

export type Role =
  | 'alchemist'
  | 'crafter'
  | 'healer'
  | 'fisherman'
  | 'gearcrafter'
  | 'jewelrycrafter'
  | 'labourer'
  | 'lumberjack'
  | 'miner'
  | 'weaponcrafter';

export const ROLES: Role[] = [
  'alchemist',
  'crafter',
  'healer',
  'fisherman',
  'gearcrafter',
  'jewelrycrafter',
  'labourer',
  'lumberjack',
  'miner',
  'weaponcrafter',
];

export type JobResponse = {
  message: string;
  character: string;
  cancelledJobs?: string[];
  jobs: Objective[];
};

export type CraftResponse = {
  message: string;
  character: string;
  job: {
    id: string;
    target: string;
    status: ObjectiveStatus;
  };
};
