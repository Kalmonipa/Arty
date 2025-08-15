import { Character, Cooldown } from "./CharacterData";
import { Drop } from "./DropData";

export type SkillInfo = {
  xp: number;
  items: Drop[];
  character: Character;
};

export type SkillData = {
  data: {
    cooldown: Cooldown;
    details: SkillInfo;
    character: Character;
  };
};
