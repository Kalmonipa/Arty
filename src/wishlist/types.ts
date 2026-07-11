export type WishlistRequest = {
  itemCode: string;
  quantity: number;
  characterName: string; // Is this needed? It should always be themselves requesting something
  minLevel?: number;
  maxLevel?: number;
  expirationDate?: string;
  cost?: number;
  currency?: string;
  acquisitionMethod?: string;
};
