import { MapSchema } from './types.js';

export type MapContentSchema = {
  type: string;
  content: string;
};

export type SimpleMapSchema = {
  x: number;
  y: number;
};

export type AllMaps = {
  data: MapSchema[];
  total: number;
  page: number;
  size: number;
  pages: number;
};
