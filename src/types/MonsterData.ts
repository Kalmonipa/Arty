import { SimpleEffect } from "./EffectData";
import { DropRate } from "./ResourceData";

export type AllMonsters = {
    data: Monster[];
    total: number;
    page: number;
    size: number;
    pages: number;
}

export type Monster = {
    name: string;
    code: string;
    level: number;
    hp: number;
    attack_fire: number;
    attack_earth: number;
    attack_water: number;
    attack_air: number;
    res_fire: number;
    res_earth: number;
    res_water: number;
    res_air: number;
    critical_strike: number;
    effects: SimpleEffect[]
    min_gold: number;
    max_gold: number;
    drops: DropRate[]
}

export type MonsterQueryParameters = {
    drop?: string;
    max_level?: number;
    min_level?: number;
    name?: string;
    page?: number;
    size?: number;
}


