import { MonsterSchema } from '../types/types.js';
import { GearEffects } from '../types/ItemData.js';
import {
  BossFightDps,
  BossFightRole,
  BossFightTank,
} from '../fightBosses/bossFight.types.js';
import { MaxFightTurns } from '../constants.js';
import {
  AttackAir,
  AttackEarth,
  AttackFire,
  AttackWater,
  ResistAir,
  ResistEarth,
  ResistFire,
  ResistWater,
} from '../gameDataConstants.js';

/**
 * @description What the party is trying to achieve in a fight, which decides
 * whether a slot is worth more as defence or as damage.
 *
 * - `survival` — the fight is won by lasting, not by killing. Raid bosses have
 *   a shared HP pool far beyond one party, so every slot buys turns.
 * - `dps_race` — the boss undoes damage faster than the party can chip at it
 *   (reconstitution, barrier, sun shield), so a slow kill is no kill at all.
 * - `balanced` — an ordinary kill: enough defence to live, the rest on damage.
 */
export type FightProfile = 'survival' | 'dps_race' | 'balanced';

export const SurvivalProfile = 'survival' as const satisfies FightProfile;
export const DpsRaceProfile = 'dps_race' as const satisfies FightProfile;
export const BalancedProfile = 'balanced' as const satisfies FightProfile;

/**
 * @description Monster effects that undo damage faster than a defensive party
 * can out-chip, so the fight has to be finished quickly or not at all.
 * `healing` and `reconstitution` restore the boss outright; `barrier` and
 * `sun_shield` discount incoming hits, which has the same effect on a slow kill.
 */
export const EnchantedMirror = 'enchanted_mirror';

const HealRaceEffects = new Set([
  'reconstitution',
  'barrier',
  'sun_shield',
  'healing',
]);

/**
 * @description Monsters whose profile the rules above read wrong. Empty until a
 * fight proves the derivation mistaken — an entry here is a bug report, not a
 * tuning knob.
 */
export const FightProfileOverrides: Record<string, FightProfile> = {};

export function resolveFightProfile(
  monster: MonsterSchema,
  overrides: Record<string, FightProfile> = FightProfileOverrides,
): FightProfile {
  const override = overrides[monster.code];
  if (override) {
    return override;
  }

  if (monster.type === 'raid_boss') {
    return SurvivalProfile;
  }

  for (const effect of monster.effects ?? []) {
    if (HealRaceEffects.has(effect.code)) {
      return DpsRaceProfile;
    }
  }

  return BalancedProfile;
}

/**
 * @description How much one point of a stat is worth to this character in this
 * fight, denominated in hit points so the slots can be compared against each
 * other. `hp` is the unit, which is what keeps the numbers derived from the
 * monster rather than tuned by hand.
 */
export type StatWeights = Partial<Record<GearEffects, number>>;

export type GearPlanParams = {
  monster: MonsterSchema;
  role?: BossFightRole;
  /** How many characters take the field, the boss excluded */
  partySize?: number;
};

/**
 * @description One whole-loadout experiment. Variants exist because the choice
 * that decides a party fight — whether this character is the one the boss
 * commits to — is a step function, not a stat: you want the tank strictly above
 * its allies on threat, not carrying as much threat as possible. No linear
 * weight says that honestly, so each variant is a complete weight vector and the
 * fight simulator arbitrates between them.
 */
/** The name of the only variant a plan offers when the allocation is settled */
export const DefaultVariant = 'default';

export type GearVariant = {
  name: string;
  weights: StatWeights;
};

export type GearPlan = {
  profile: FightProfile;
  role?: BossFightRole;
  /** What the fight is worth per stat, before any allocation experiment */
  weights: StatWeights;
  /** Loadouts to hand the simulator, best guess first */
  variants: GearVariant[];
};

/**
 * @description How many turns the monster gets. A turn belongs to one actor, so
 * a party of three plus the boss means the boss lands only a quarter of the
 * hundred. Bodies on the field are the cheapest mitigation there is.
 */
export function expectedMonsterTurns(partySize: number): number {
  return Math.floor(MaxFightTurns / (Math.max(partySize, 1) + 1));
}

const AttackToResistance = [
  { attack: AttackAir, resistance: ResistAir },
  { attack: AttackEarth, resistance: ResistEarth },
  { attack: AttackFire, resistance: ResistFire },
  { attack: AttackWater, resistance: ResistWater },
] as const;

/**
 * @description What a point of each resistance saves over the whole fight: 1%
 * off every hit the monster lands with that element. An element it never uses is
 * left out rather than given a zero, so a slot that offers only that resistance
 * scores nothing and falls through to the next candidate.
 */
function resistanceWeights(
  monster: MonsterSchema,
  monsterTurns: number,
): StatWeights {
  const weights: StatWeights = {};

  for (const { attack, resistance } of AttackToResistance) {
    const attackValue = monster[attack];
    if (attackValue > 0) {
      weights[resistance] = attackValue * 0.01 * monsterTurns;
    }
  }

  return weights;
}

function heaviestAttack(monster: MonsterSchema): number {
  return Math.max(
    monster.attack_air,
    monster.attack_earth,
    monster.attack_fire,
    monster.attack_water,
  );
}

/**
 * @description In the threat variant a point of threat is priced exactly like a
 * point of resistance. That keeps it from steamrolling the slots: gear whose
 * only merit is threat still loses to gear that actually blunts the attack, so
 * the lead gets taken in the slots where it is nearly free. Whether the lead was
 * worth taking at all is the simulator's question, not this function's.
 */
function threatLeadWeight(
  monster: MonsterSchema,
  monsterTurns: number,
): number {
  return heaviestAttack(monster) * 0.01 * monsterTurns;
}

/**
 * @description What a point of threat costs anyone who is not the tank. A
 * support character that drifts above the tank inherits the boss along with
 * every hit it has no self-restores to survive, so one point is priced at a full
 * hit taken. Steep on purpose — nothing a ring offers is worth that trade.
 */
function threatRiskWeight(monster: MonsterSchema): number {
  return -heaviestAttack(monster);
}

/**
 * @description The loadouts worth simulating for this character. A tank gets
 * several because the allocation is the open question; everyone else gets one,
 * since their job is decided the moment the tank holds the boss.
 */
function variantsFor(
  profile: FightProfile,
  role: BossFightRole | undefined,
  weights: StatWeights,
  threatLead: number,
  threatRisk: number,
): GearVariant[] {
  if (profile === SurvivalProfile && role === BossFightTank) {
    return [
      { name: 'threat', weights: { ...weights, threat: threatLead } },
      { name: 'resist', weights: { ...weights } },
      { name: 'bulk', weights: { ...weights, hp: 2 } },
    ];
  }

  return [
    { name: DefaultVariant, weights: { ...weights, threat: threatRisk } },
  ];
}

const ResistanceToDamage = [
  { resistance: 'res_air', damage: 'dmg_air' },
  { resistance: 'res_earth', damage: 'dmg_earth' },
  { resistance: 'res_fire', damage: 'dmg_fire' },
  { resistance: 'res_water', damage: 'dmg_water' },
] as const;

/** The element the monster resists least, which is where damage is worth adding */
function softestElement(monster: MonsterSchema) {
  return [...ResistanceToDamage].sort(
    (a, b) => monster[a.resistance] - monster[b.resistance],
  )[0];
}

/**
 * @description What a point of damage is worth. In a fight won by lasting it is
 * a tie-breaker rather than a valuation — a hundredth of a point of resistance,
 * enough to decide the slots that offer nothing defensive and never enough to
 * outrank a slot that does. In a race it is the whole point, so it is priced
 * like resistance instead.
 *
 * Against a monster that reflects, damage is a liability for whoever is already
 * taking the hits: `enchanted_mirror` returns half of what it is dealt, once
 * every three turns, to the character that dealt it. That is why crit artifacts
 * on a party with no threat lead scored worse than none at all.
 */
function damageWeights(
  monster: MonsterSchema,
  profile: FightProfile,
  role: BossFightRole | undefined,
  resistancePrice: number,
): StatWeights {
  // Damage is priced properly when it is the point of the fight or the point of
  // the character; otherwise it only breaks ties between slots that offer no
  // defence at all.
  const damageMatters = profile === DpsRaceProfile || role === BossFightDps;
  let price = damageMatters ? resistancePrice : resistancePrice / 100;

  const mirrors = (monster.effects ?? []).some(
    (effect) => effect.code === EnchantedMirror,
  );
  if (mirrors && role === BossFightTank) {
    price = -price;
  }

  const { damage } = softestElement(monster);
  return { dmg: price, [damage]: price };
}

export function resolveGearPlan(params: GearPlanParams): GearPlan {
  const profile = resolveFightProfile(params.monster);
  const monsterTurns = expectedMonsterTurns(params.partySize ?? 1);

  const resistancePrice = heaviestAttack(params.monster) * 0.01 * monsterTurns;

  const weights: StatWeights = {
    hp: 1,
    ...resistanceWeights(params.monster, monsterTurns),
    ...damageWeights(params.monster, profile, params.role, resistancePrice),
  };

  return {
    profile,
    role: params.role,
    weights,
    variants: variantsFor(
      profile,
      params.role,
      weights,
      threatLeadWeight(params.monster, monsterTurns),
      threatRiskWeight(params.monster),
    ),
  };
}
