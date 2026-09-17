import { FakeCharacterSchema } from '../types/types.js';
import { ObjectiveResult } from '../types/ObjectiveData.js';

export type ProposeLoadoutResponse = {
  message: string;
  character: string;
  proposedLoadout: FakeCharacterSchema;
};

export type SoloFightSimResult = ObjectiveResult & {
  /** Percentage of simulated fights won */
  winRate: number;
  /** Average turns across the winning simulations; 0 if none were won */
  averageTurns: number;
  /** The loadout behind the best run, potions included */
  loadout?: FakeCharacterSchema;
};
