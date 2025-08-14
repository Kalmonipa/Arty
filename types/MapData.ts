export type MapContentSchema = {
  type: string;
  content: string
}

export type MapSchema = {
  name: string;
  skin: string;
  x: number;
  y: number;
  content: MapContentSchema // ToDo: This seems to be undefined in the response
};

export type AllMaps = {
  data: MapSchema[];
  total: number;
  page: number;
  size: number;
  pages: number;
}