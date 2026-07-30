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
  | 'paused'
  | 'on_hold';

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
 * fulfilled before it can continue. Resumed when every `waitingOn` request is
 * fulfilled; retried once (then dropped) if a request expires or disappears.
 */
export interface OnHoldJob {
  job: SerializedJob;
  waitingOn: WishlistRequestRef[];
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
