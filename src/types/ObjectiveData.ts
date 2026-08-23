export type ObjectiveTargets = {
  code: string; // This should probably be `code`
  quantity: number;
};

export type ObjectiveResult = {
  /**
   * @description Whether the objective has been completed or not
   */
  complete: boolean;
  /**
   * @description Whether the objective was successful or not
   */
  success: boolean;
  /**
   * @description The reason for the current state
   */
  reason: ObjectiveStatus;
};

export const ObjectiveCancelled: ObjectiveResult = {
  complete: true,
  success: false,
  reason: 'cancelled',
};

export const ObjectiveCompleted: ObjectiveResult = {
  complete: true,
  success: true,
  reason: 'complete',
};

export const ObjectiveFailed: ObjectiveResult = {
  complete: true,
  success: false,
  reason: 'failed',
};

export const ObjectiveOnHold: ObjectiveResult = {
  complete: false,
  success: false,
  reason: 'on_hold',
};

export type ObjectiveStatus =
  | 'cancelled'
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'paused'
  | 'on_hold';

export interface SerializedJob {
  type: string;
  objectiveId: string;
  status: string;
  progress: number;
  parentId?: string;
  childId?: string;
  rootId?: string;
  maxRetries: number;
  [key: string]: unknown;
}

/**
 * A wishlist request a parked job is waiting on, recording the item and quantity
 * requested alongside the request id used to check its fulfilment.
 */
export interface WishlistRequestRef {
  requestId: number;
  itemCode: string;
  quantity: number;
}

/**
 * A job parked because it raised one or more wishlist requests it needs
 * fulfilled before it can continue. The requests are the wishlist rows recorded
 * against its objectiveId, not a copy held here. Resumed when every one of them
 * is fulfilled; retried once (then dropped) if they expire or disappear.
 */
export interface OnHoldJob {
  job: SerializedJob;
  parkedAt: string;
  retried: boolean;
}

export type SimpleObjectiveInfo = {
  id: string;
  status: string;
  parentId?: string;
  childId?: string;
};

export type OnHoldJobInfo = {
  id: string;
  status: string;
  progress: number;
  parentId?: string;
  childId?: string;
  waitingOn: WishlistRequestRef[];
  parkedAt: string;
};

/**
 * The objective result plus the stats on the fight sim
 */
export type FightSimVerdict = ObjectiveResult & {
  winRate: number;
  averageTurns: number;
};
