import winston from 'winston';
import {
  DataPageItemSchema,
  GatheringSkill,
  ItemSchema,
  ItemType,
} from './types/types.js';
import { getAllItemInformation } from './api_calls/Items.js';
import { ApiError } from './classes/Error.js';
import { WeaponFlavours } from './types/ItemData.js';
import dotenv from 'dotenv';
import { Role } from './types/CharacterData.js';

dotenv.config({ quiet: true });

export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');

export const CharName = getEnv('CHARACTER_NAME');
export const CharRole = getEnv('ROLE').toLowerCase() as Role;
export const MAX_COMBAT_LEVEL = 50;
export const MAX_SKILL_LEVEL = 50;
export const CRITICAL_MODIFIER = 0.5;

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
  winston.format.printf(({ timestamp, level, message, character, ...meta }) => {
    const logObject = {
      timestamp,
      level,
      message,
      character: character || CharName,
      ...meta,
    };
    return JSON.stringify(logObject);
  }),
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
    new winston.transports.File({
      filename: './logs/arty.log',
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
 * @description Checks that the env variables are set. If any are undefined, throw an error
 * @param name
 * @returns the env var value
 */
export function getEnv(name: string): string {
  if (typeof process.env[name] === 'undefined') {
    throw new Error(`Variable ${name} undefined.`);
  }

  return process.env[name];
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

  const allWeapons: ApiError | DataPageItemSchema = await getAllItemInformation(
    { type: 'weapon' },
  );
  if (allWeapons instanceof ApiError) {
    logger.error(`Failed to build list of useful weapons: ${allWeapons}`);
    return;
  }

  allWeapons.data.forEach((weapon) => {
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
            //logger.debug(`Adding ${weapon.code} object to ${effect.code} map`);
            skillArray.push(weapon);
          }
        }
      });
    }
  });

  return weaponMap;
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
 * @description Builds a map of all the utilities
 * The key being the effect (restore, res_fire, fire_damage, etc)
 * The value being an array of the items that have the key effect
 */
export async function buildListOf(
  itemType: ItemType,
): Promise<Record<string, ItemSchema[]>> {
  logger.info(`Building map of ${itemType}`);

  const itemMap: Record<string, ItemSchema[]> = {};

  const allItems: ApiError | DataPageItemSchema = await getAllItemInformation({
    type: itemType,
  });
  if (allItems instanceof ApiError) {
    logger.error(`Failed to build list of useful ${itemType}: ${allItems}`);
    return {};
  }

  allItems.data.forEach((item) => {
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
