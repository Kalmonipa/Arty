export type AttackTypes = 'air' | 'earth' | 'fire' | 'water';

export type TurnsDetails = {
  attackType: AttackTypes;
  dmg: number;
  criticalChance: number;
  victimResistance: number
}[];
