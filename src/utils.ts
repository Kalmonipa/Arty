import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import {
  CharacterSchema,
  CraftSkill,
  GatheringSkill,
  ItemSchema,
  ItemType,
  MapSchema,
  SimpleEffectSchema,
} from './types/types.js';
import { ApiError } from './core/Error.js';
import { UtilityEffects, WeaponFlavours } from './types/ItemData.js';
import { MonsterResistance } from './types/MonsterData.js';
import { Role, ROLES } from './types/CharacterData.js';
import { getCharacter } from './character/character.apiCalls.js';
import {
  CharName,
  AllCharNames,
  ApiToken,
  MaxEquippedUtilities,
} from './constants.js';
import { getAllMaps } from './api_calls/Maps.js';
import {
  Alchemy,
  Cooking,
  Gearcrafting,
  Jewelrycrafting,
  Mining,
  Weaponcrafting,
  Woodcutting,
} from './names.js';
import * as fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @description Array of all maps
 */
export async function AllMaps(): Promise<MapSchema[]> {
  const allMaps = await getAllMaps({});

  logger.info(`Found ${allMaps.length} total maps`);

  return allMaps;
}

/**
 * @description Array of all transition maps
 */
export function TransitionLocations(allMaps: MapSchema[]): MapSchema[] {
  const transitionLocations = allMaps.filter(
    (map) =>
      map.interactions.transition !== undefined &&
      map.interactions.transition !== null,
  );

  logger.info(`Found ${transitionLocations.length} transition maps`);

  return transitionLocations;
}

const logLevel = process.env.LOG_LEVEL || 'info';

export const MyHeaders = new Headers({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${ApiToken}`,
});

export const getRequestOptions = {
  method: 'GET',
  headers: MyHeaders,
};

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'DD-MM-YYYYTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(
    ({
      timestamp,
      level,
      message,
      character,
      objectiveId,
      rootId,
      ...meta
    }) => {
      const logObject = {
        timestamp,
        level,
        message,
        character: character || CharName,
        ...(objectiveId && { objectiveId }),
        ...(rootId && { rootId }),
        ...meta,
      };
      return JSON.stringify(logObject);
    },
  ),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'DD-MM-YY HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, character }) => {
    const char = character || CharName;
    return `[${timestamp}] [${char}] ${level.toUpperCase()}: ${message}`;
  }),
);

export const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: {
    character: CharName,
  },
  transports: [
    new DailyRotateFile({
      filename: './logs/arty-%DATE%.log',
      datePattern: 'YYYY-[W]WW',
      maxSize: '200m',
      maxFiles: '30d',
      zippedArchive: true,
      level: logLevel,
      format: customFormat,
    }),

    new winston.transports.Console({
      level: logLevel,
      format: consoleFormat,
    }),
  ],
});

/**
 * Gets a random number between the two values
 * @param min Lowest value
 * @param max Highest value
 * @returns A random number between the min and max
 */
export function getRandomInt(min: number, max: number) {
  const minCeiled = Math.ceil(min);
  const maxFloored = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
}

/**
 * @description Used after every action to wait for the cooldown period to finish
 * @param cooldown Number of seconds to sleep for
 */
export const sleep = (
  cooldown: number,
  reason: string,
  shouldLog?: boolean,
) => {
  if (shouldLog || shouldLog === undefined) {
    logger.info(`Sleeping for ${cooldown} seconds because of ${reason}`);
  }
  return new Promise((r) => setTimeout(r, cooldown * 1000));
};

/**
 * @description Builds a map of all the tools that help specific skills
 * @returns {Record<CraftSkill, ItemSchema[]>}
 */
export async function buildListOfWeapons(): Promise<
  Record<WeaponFlavours, ItemSchema[]>
> {
  logger.info(`Building map of weapons`);

  const gatherSkills: GatheringSkill[] = [
    'fishing',
    'woodcutting',
    'mining',
    'alchemy',
  ];

  const weaponMap: Record<WeaponFlavours, ItemSchema[]> = {} as Record<
    WeaponFlavours,
    ItemSchema[]
  >;

  gatherSkills.forEach((skill) => {
    weaponMap[skill] = [];
  });
  weaponMap['combat'] = [];

  const itemData = await readItemCatalogue();

  const allWeapons: ItemSchema[] = itemData.filter(
    (item) => item.type === 'weapon',
  );

  allWeapons.forEach((weapon) => {
    if (weapon.subtype === '') {
      const combatArray = weaponMap['combat'];
      // Excluding wooden stick here because I don't think it needs to be in the map
      if (
        combatArray &&
        !combatArray.includes(weapon) &&
        weapon.code !== 'wooden_stick'
      ) {
        //logger.debug(`Adding ${weapon.code} object to combat map`);
        combatArray.push(weapon);
      }
    } else if (weapon.effects) {
      weapon.effects.forEach((effect) => {
        if (gatherSkills.includes(effect.code as GatheringSkill)) {
          const skillArray = weaponMap[effect.code as GatheringSkill];
          if (skillArray && !skillArray.includes(weapon)) {
            logger.debug(`Adding ${weapon.code} object to ${effect.code} map`);
            skillArray.push(weapon);
          }
        }
      });
    }
  });

  return weaponMap;
}

/**
 * @description checks to see if we're working with any skill
 */
export function isSkill(value: string): value is CraftSkill | GatheringSkill {
  return isCraftingSkill(value) || isGatheringSkill(value);
}

/**
 * @description How much of a given effect an item grants, 0 if it doesn't grant any
 */
export function effectValueOf(item: ItemSchema, effect: string): number {
  return item.effects?.find((e) => e.code === effect)?.value ?? 0;
}

/**
 * @description The utility tiers a character could actually equip right now:
 * high enough level, and some in hand or in the bank. Weakest first.
 */
export function usableUtilityTiers(
  utilities: ItemSchema[],
  charLevel: number,
  stockOf: (code: string) => number,
): { item: ItemSchema; available: number }[] {
  return [...utilities]
    .filter((item) => item.level <= charLevel)
    .sort((first, second) => first.level - second.level)
    .map((item) => ({
      item,
      available: Math.min(stockOf(item.code), MaxEquippedUtilities),
    }))
    .filter((tier) => tier.available > 0);
}

export function scoreWeaponAgainstResistances(
  weapon: ItemSchema,
  resistances: MonsterResistance[],
): number {
  return resistances.reduce(
    (total, resistance) =>
      total +
      effectValueOf(weapon, resistance.atkCounterType) *
        (1 - resistance.value / 100),
    0,
  );
}

/**
 * @description checks to see if we're working with a gathering skill
 * @param value the skill to check
 * @returns true if the provided skill is a gathering skill
 */
export function isGatheringSkill(value: string): value is GatheringSkill {
  return ['fishing', 'woodcutting', 'mining', 'alchemy'].includes(value);
}

/**
 * @description The cooldown a fight incurs. It's driven by how long the fight
 * runs, not by damage dealt or taken, so a tougher monster costs proportionally
 * more time per kill.
 * @param turns how many turns the fight takes
 * @param haste the character's haste stat, as a percentage reduction
 * @returns the cooldown in seconds, never below the game's 5s floor
 */
export function estimateFightCooldown(turns: number, haste: number): number {
  return Math.max(5, turns * 2 * (1 - haste / 100));
}

/**
 * @description checks to see if we're working with a crafting skill
 * @param value the skill to check
 * @returns true if the provided skill is a crafting skill
 */
export function isCraftingSkill(value: string): value is CraftSkill {
  return [
    Mining,
    Woodcutting,
    Weaponcrafting,
    Gearcrafting,
    Jewelrycrafting,
    Cooking,
    Alchemy,
  ].includes(value);
}

/**
 * @description Builds a map of the specified item so we don't have to make API calls
 */
export async function readItemCatalogue(): Promise<ItemSchema[]> {
  const itemStateFilePath: string = path.join(
    process.cwd(),
    'data',
    'items-data.json',
  );

  const fileContent = await fs.readFile(itemStateFilePath, 'utf-8');
  return JSON.parse(fileContent);
}

export async function getCraftableItems(
  skill: CraftSkill,
  maxLevel: number,
): Promise<ItemSchema[] | undefined> {
  try {
    const items = await readItemCatalogue();
    return items.filter(
      (item) => item.craft?.skill === skill && item.level <= maxLevel,
    );
  } catch (error) {
    logger.error(`Could not read the item catalogue: ${error.message}`);
    return undefined;
  }
}

export async function buildListOf(
  itemType: ItemType,
): Promise<Record<string, ItemSchema[]>> {
  logger.info(`Building map of ${itemType}`);

  const itemMap: Record<string, ItemSchema[]> = {};

  const itemData = await readItemCatalogue();

  const allItems: ItemSchema[] = itemData.filter(
    (item) => item.type === itemType,
  );

  allItems.forEach((item) => {
    if (item.effects) {
      item.effects.forEach((effect) => {
        if (itemMap[effect.code]) {
          //logger.debug(`Adding ${item.code} to ${effect.code} map`);
          itemMap[effect.code].push(item);
        } else {
          //logger.debug(`Adding ${effect.code} to ${itemType} map`);
          itemMap[effect.code] = [item];
        }
      });
    }
  });

  return itemMap;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}

export async function GetCharacterData(): Promise<CharacterSchema[]> {
  let charDetails: CharacterSchema[] = [];

  for (const character of AllCharNames) {
    const charDetail = await getCharacter(character);
    if (charDetail instanceof ApiError) {
      logger.error(
        `Failed to get data for ${character}: [${charDetail.error.code}] ${charDetail.message}`,
      );
      if (charDetail.error.code === 500 || charDetail.error.code === 502) {
        await sleep(300, '5xx error code');
      }
      break;
    }

    charDetails.push(charDetail);
  }

  return charDetails;
}

export function isValidLevelLimit(level: any): level is number {
  return (
    level !== null &&
    level !== undefined &&
    level !== '' &&
    String(level) !== 'null'
  );
}

export function getHighestCharLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.level > curr.level ? prev : curr,
  ).level;
}

export function getLowestCharLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.level < curr.level ? prev : curr,
  ).level;
}
export function getLowestAlchemyLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.alchemy_level < curr.alchemy_level ? prev : curr,
  ).alchemy_level;
}

export function getLowestFishingLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.fishing_level < curr.fishing_level ? prev : curr,
  ).fishing_level;
}
export function getLowestMiningLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.mining_level < curr.mining_level ? prev : curr,
  ).mining_level;
}
export function getLowestWoodcuttingLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.woodcutting_level < curr.woodcutting_level ? prev : curr,
  ).woodcutting_level;
}
export function getHighestWeaponcraftingLevel(
  allCharacterDetails: CharacterSchema[],
): number {
  return allCharacterDetails.reduce((prev, curr) =>
    prev.weaponcrafting_level > curr.weaponcrafting_level ? prev : curr,
  ).weaponcrafting_level;
}

/**
 * The fields a fleet snapshot fills in. Kept structural so utils doesn't have to
 * import Character, which imports utils.
 */
type FleetSnapshotTarget = {
  allCharacterDetails?: CharacterSchema[];
  lowestCharLevel?: number;
  highestCharLevel?: number;
  lowestAlchemyLevel?: number;
  lowestFishingLevel?: number;
  lowestMiningLevel?: number;
  lowestWoodcuttingLevel?: number;
  highestWeaponcraftingLevel?: number;
};

/**
 * @description Points a character at a fresh reading of the whole fleet.
 *
 * The snapshot drives decisions about what the fleet as a whole needs — which
 * potion tiers are worth brewing, which gear is worth making — so a stale one
 * quietly plans for a fleet that no longer exists. It's applied at startup and
 * refreshed whenever a job has already paid for the character data.
 */
export function applyFleetSnapshot(
  character: FleetSnapshotTarget,
  allCharacterDetails: CharacterSchema[],
): void {
  if (allCharacterDetails.length === 0) {
    logger.warn('Empty fleet snapshot; keeping the previous one');
    return;
  }

  character.allCharacterDetails = allCharacterDetails;
  character.lowestCharLevel = getLowestCharLevel(allCharacterDetails);
  character.highestCharLevel = getHighestCharLevel(allCharacterDetails);
  character.lowestAlchemyLevel = getLowestAlchemyLevel(allCharacterDetails);
  character.lowestFishingLevel = getLowestFishingLevel(allCharacterDetails);
  character.lowestMiningLevel = getLowestMiningLevel(allCharacterDetails);
  character.lowestWoodcuttingLevel =
    getLowestWoodcuttingLevel(allCharacterDetails);
  character.highestWeaponcraftingLevel =
    getHighestWeaponcraftingLevel(allCharacterDetails);
}
