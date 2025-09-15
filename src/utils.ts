import pino from 'pino';
import {
  GatheringSkill,
  GetAllItemsItemsGetResponse,
  ItemSchema,
  ItemType,
} from './types/types';
import { getAllItemInformation } from './api_calls/Items';
import { ApiError } from './classes/Error';
import { WeaponFlavours } from './types/ItemData';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const CharName = getEnv('CHARACTER_NAME');
export const ApiUrl = process.env.API_URL || `https://api.artifactsmmo.com`; // Sometimes we use the test server
export const ApiToken = getEnv('API_TOKEN');
const logLevel = process.env.LOG_LEVEL || 'info';


export const MyHeaders = new Headers({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${ApiToken}`,
});


export const logger = pino({
  level: logLevel,
  base: {
    character: CharName,
  },
  transport: {
    targets: [
      {
        level: logLevel,
        target: 'pino/file',
        options: {
          destination: './logs/arty.log',
        },
      },
      {
        level: logLevel,
        target: 'pino-pretty',
        options: {
          messageFormat: '[{character}] {msg}',
          ignore: 'character'
        },
        
      },
    ],
  },
  timestamp: pino.stdTimeFunctions.isoTime, //'DD-MM-YYYY HH:mm:ss.SSS'
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

  let weaponMap: Record<WeaponFlavours, ItemSchema[]> = {} as Record<
    WeaponFlavours,
    ItemSchema[]
  >;

  gatherSkills.forEach((skill) => {
    weaponMap[skill] = [];
  });
  weaponMap['combat'] = [];

  const allWeapons: ApiError | GetAllItemsItemsGetResponse =
    await getAllItemInformation({type: 'weapon'});
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
        logger.debug(`Adding ${weapon.code} object to combat map`);
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

export function isGatheringSkill(value: string): value is GatheringSkill {
  return ['fishing', 'woodcutting', 'mining', 'alchemy'].includes(value);
}

/**
 * @description Builds a map of all the utilities
 */
export async function buildListOfUtilities(): Promise<
  Record<string, ItemSchema[]>
> {
  logger.info(`Building map of utilities`);

  var utilitiesMap: Record<string, ItemSchema[]> = {};

  const allUtilities: ApiError | GetAllItemsItemsGetResponse =
    await getAllItemInformation({ type: 'utility' });
  if (allUtilities instanceof ApiError) {
    logger.error(`Failed to build list of useful utility: ${allUtilities}`);
    return;
  }

  allUtilities.data.forEach((utility) => {
    utility.effects.forEach((effect) => {
      if (utilitiesMap[effect.code]) {
        logger.debug(`Adding ${utility.code} to ${effect.code} map`);
        utilitiesMap[effect.code].push(utility);
      } else {
        logger.debug(`Adding ${effect.code} to utilities map`);
        utilitiesMap[effect.code] = [utility];
      }
    });
  });

  return utilitiesMap;
}

/**
 * @description Builds a map of all the utilities
 */
export async function buildListOf(
  itemType: ItemType,
): Promise<Record<string, ItemSchema[]>> {
  logger.info(`Building map of ${itemType}`);

  var itemMap: Record<string, ItemSchema[]> = {};

  const allItems: ApiError | GetAllItemsItemsGetResponse =
    await getAllItemInformation({ type: itemType });
  if (allItems instanceof ApiError) {
    logger.error(`Failed to build list of useful ${itemType}: ${allItems}`);
    return;
  }

  allItems.data.forEach((utility) => {
    utility.effects.forEach((effect) => {
      if (itemMap[effect.code]) {
        logger.debug(`Adding ${utility.code} to ${effect.code} map`);
        itemMap[effect.code].push(utility);
      } else {
        logger.debug(`Adding ${effect.code} to ${itemType} map`);
        itemMap[effect.code] = [utility];
      }
    });
  });

  return itemMap;
}
