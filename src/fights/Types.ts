import { FakeCharacterSchema } from '../types/types.js';

export type ProposeLoadoutResponse = {
  message: string;
  character: string;
  proposedLoadout: FakeCharacterSchema;
};
