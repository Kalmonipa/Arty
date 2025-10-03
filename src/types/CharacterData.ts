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
  | 'fighter'
  | 'fisherman'
  | 'gearcrafter'
  | 'jewelrycrafter'
  | 'lumberjack'
  | 'miner'
  | 'weaponcrafter';
