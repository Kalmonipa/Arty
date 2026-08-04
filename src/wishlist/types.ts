export type WishlistRequest = {
  itemCode: string;
  quantity: number;
  characterName: string; // Is this needed? It should always be themselves requesting something
  minLevel?: number;
  maxLevel?: number;
  expirationDate?: string;
  cost?: number;
  currency?: string;
  acquisitionMethod?: AcquisitionMethod;
  /**
   * The job that can't continue without this item. Left unset for a request
   * nothing is waiting on, e.g. a character wishing for better gear.
   */
  jobId?: string;
};

export interface WishlistRow {
  id: number;
  item_code: string;
  quantity: number;
  character: string;
  min_level: number | null;
  max_level: number | null;
  expiration_date: Date | null;
  cost: number | null;
  currency: string | null;
  acquisition_method: AcquisitionMethod | null;
  executing: boolean;
  executing_by: string | null;
  claimed_at: Date | null;
  fulfilled: boolean;
  created_at: Date;
  job_id: string | null;
}

/**
 * Different ways to acquire something. Characters can filter wishlist request based on the methods
 * that are within their role responsibilities
 * One of: buy, mining, fishing, woodcutting, gearcrafting, weaponcrafting, jewelrycrafting, tasks
 */
export type AcquisitionMethod =
  | 'buy'
  | 'tasks'
  | 'fight'
  | 'mining'
  | 'fishing'
  | 'woodcutting'
  | 'alchemy'
  | 'cooking'
  | 'gearcrafting'
  | 'weaponcrafting'
  | 'jewelrycrafting';
