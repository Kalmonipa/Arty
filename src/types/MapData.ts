export type MapContentSchema = {
  type: string;
  content: string;
};

export type MapSchema = {
  name: string;
  skin: string;
  x: number;
  y: number;
  content: MapContentSchema;
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
