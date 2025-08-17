import { CharacterSchema, CooldownSchema, SimpleItemSchema } from "./types";

export type BankItemTransaction = {
  cooldown: CooldownSchema;
  items: SimpleItemSchema[];
  bank: SimpleItemSchema[];
  character: CharacterSchema;
};
