import pino from 'pino';
import {
  CharacterLeaderboardType,
  CraftSkill,
  GatheringSkill,
  GetAllItemsItemsGetResponse,
  ItemSchema,
  ItemType,
} from './types/types';
import { getAllItemInformation } from './api_calls/Items';
import { ApiError } from './classes/ErrorClass';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = pino({
  level: logLevel,
  base: undefined,
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
        options: {},
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
export const sleep = (cooldown: number, reason: string, shouldLog?: boolean) => {
  if (shouldLog || shouldLog === undefined) {
    logger.info(`Sleeping for ${cooldown} seconds because of ${reason}`);
  }
  return new Promise((r) => setTimeout(r, cooldown * 1000));
};

/**
 * @description Builds a map of all the tools that help specific skills
 * @returns {Record<CraftSkill, ItemSchema[]>}
 */
export async function buildListOfGatheringWeapons(): Promise<
  Record<GatheringSkill, ItemSchema[]>
> {
  logger.info(`Building map of weapons`);

  const craftSkills: GatheringSkill[] = [
    'fishing',
    'woodcutting',
    'mining',
    'alchemy',
  ];

  var weaponMap: Record<GatheringSkill, ItemSchema[]> = {} as Record<
    GatheringSkill,
    ItemSchema[]
  >;

  craftSkills.forEach((skill) => {
    weaponMap[skill] = [];
  });

  const allWeapons: ApiError | GetAllItemsItemsGetResponse =
    await getAllItemInformation({ query: { type: 'weapon' }, url: '/items' });
  if (allWeapons instanceof ApiError) {
    logger.error(`Failed to build list of useful weapons: ${allWeapons}`);
    return;
  }

  allWeapons.data.forEach((weapon) => {
    if (weapon.effects) {
      weapon.effects.forEach((effect) => {
        if (craftSkills.includes(effect.code as GatheringSkill)) {
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
    await getAllItemInformation({ query: { type: 'utility' }, url: '/items' });
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
    await getAllItemInformation({ query: { type: itemType }, url: '/items' });
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
