import pino from 'pino';
import { CharacterLeaderboardType, CraftSkill, GetAllItemsItemsGetResponse, ItemSchema } from './types/types';
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
export const sleep = (cooldown: number, reason: string) => {
  logger.info(`Sleeping for ${cooldown} seconds because of ${reason}`);
  return new Promise((r) => setTimeout(r, cooldown * 1000));
};

/**
 * @description Builds a map of all the tools that help specific skills
 * @returns {Record<CraftSkill, ItemSchema[]>}
 */
export async function buildListOfUsefulWeapons(): Promise<Record<CraftSkill, ItemSchema[]>[]> {

  const craftSkills: CraftSkill[] = [
    'weaponcrafting',
    'gearcrafting', 
    'jewelrycrafting',
    'cooking',
    'woodcutting',
    'mining',
    'alchemy'
  ];

  var weaponMap: Record<CraftSkill, ItemSchema[]> = {} as Record<CraftSkill, ItemSchema[]>

  craftSkills.forEach(skill => {
    weaponMap[skill] = [];
  });

  const allWeapons: ApiError | GetAllItemsItemsGetResponse = await getAllItemInformation({query: { type: 'weapon'}, url: '/items'})
  if (allWeapons instanceof ApiError) {
    logger.error(`Failed to build list of useful weapons: ${allWeapons}`)
    return;
  }

  allWeapons.data.forEach(weapon => {
    if (weapon.effects) {
      weapon.effects.forEach(effect => {
        if (craftSkills.includes(effect.code as CraftSkill)) {
          const skillArray = weaponMap[effect.code as CraftSkill];
          if (skillArray && !skillArray.includes(weapon)) {
            skillArray.push(weapon);
          }
        }
      })
    }
  });

  return []
}
