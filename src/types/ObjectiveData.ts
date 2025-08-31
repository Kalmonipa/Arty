export type ObjectiveTargets = {
  code: string; // This should probably be `code`
  quantity: number;
};

export type ObjectiveStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'failed';
