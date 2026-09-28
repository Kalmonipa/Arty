import { MapLayer, MapSchema } from '../../types/types.js';

export type ZoneId = number;

export interface Zone {
  id: ZoneId;
  layer: MapLayer;
  mapIds: Set<number>;
}

export interface ZoneIndex {
  /** Maps every walkable/restricted map_id to the zone it belongs to. */
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
}

export interface TransitionEdge {
  fromZone: ZoneId;
  toZone: ZoneId;
  transitionPoint: MapSchema;
}

export interface NavigationGraph {
  zoneOfMapId: Map<number, ZoneId>;
  zones: Map<ZoneId, Zone>;
  /** Outgoing transition edges keyed by source zone. */
  edges: Map<ZoneId, TransitionEdge[]>;
  /** Every map by id, so a journey can be costed from map ids alone. */
  mapById: Map<number, MapSchema>;
}

/** What a journey costs, in the two currencies a route can be paid in */
export type JourneyCost = {
  /** Cooldown seconds: five a tile walked, five a transition taken */
  seconds: number;
  /** Gold the transitions on the route charge to pass */
  gold: number;
};

/** A potion that drops the drinker onto a fixed map when used */
export type TeleportPotion = {
  code: string;
  /** The map the potion lands you on */
  mapId: number;
  /** Character level needed to use it */
  level: number;
};
