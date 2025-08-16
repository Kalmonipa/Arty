import { Drop } from "./DropData";

export type Fight = {
    xp: number;
    gold: number;
    drops: Drop[];
    turns: number;
    logs: string[];
    result: string[];
}