import { MapSchema } from '../types/types.js';

/**
 * Outcome of a single transition step. `reroute` is true when the step failed because the
 * game reported no walkable path (595), meaning move() should try a different route rather
 * than give up.
 */
export type TransitionStepResult = { ok: boolean; reroute?: boolean };

/**
 * Outcome of drawing a route's requirements from the bank. `moved` is true when doing so
 * relocated the character, meaning the route it was planned against is now stale.
 */
export type PreparedRouteResult = {
  ok: boolean;
  moved: boolean;
  blockedTransitionId?: number | null;
};

/**
 * A route whose gates are all paid for and which starts from where the character actually
 * stands. `blockedTransitionId` names the gate to exclude when the route can't be settled.
 */
export type SettledRoute = {
  ok: boolean;
  path: MapSchema[];
  blockedTransitionId?: number | null;
};
