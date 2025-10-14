export type ObjectiveTargets = {
  code: string; // This should probably be `code`
  quantity: number;
};

export type ObjectiveStatus =
  | 'cancelled'
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'paused';

export interface SerializedJob {
  type: string;
  objectiveId: string;
  status: string;
  progress: number;
  parentId?: string;
  childId?: string;
  maxRetries: number;
  [key: string]: unknown;
}

export type SimpleObjectiveInfo = {
  id: string;
  status: string;
  parentId?: string;
  childId?: string;
};
