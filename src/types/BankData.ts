import { CharacterSchema, CooldownSchema, SimpleItemSchema } from './types.js';

export type BankItemTransaction = {
  cooldown: CooldownSchema;
  items: SimpleItemSchema[];
  bank: SimpleItemSchema[];
  character: CharacterSchema;
};
