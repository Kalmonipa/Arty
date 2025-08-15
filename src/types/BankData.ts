import { Character, Cooldown } from "./CharacterData";
import { SimpleItem } from "./ItemData";

export type BankItemTransaction = {
  cooldown: Cooldown;
  items: SimpleItem;
  bank: SimpleItem;
  character: Character;
};
