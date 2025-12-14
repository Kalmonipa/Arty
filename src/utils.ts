import winston from 'winston';
import {
  CharacterSchema,
  CraftSkill,
  DataPageItemSchema,
  GatheringSkill,
  ItemSchema,
  ItemType,
  MapSchema,
} from './types/types.js';
import { getAllItemInformation } from './api_calls/Items.js';
import { ApiError } from './core/Error.js';
import { WeaponFlavours } from './types/ItemData.js';
import { Role, ROLES } from './types/CharacterData.js';
import { getCharacter } from './api_calls/Character.js';
import { CharName, AllCharNames, ApiToken } from './constants.js';
import { getMaps } from './api_calls/Maps.js';

/**
 * @description Array of all transition maps
 */
export async function TransitionLocations(): Promise<MapSchema[]> {
  const allMaps = await getMaps({});
  if (allMaps instanceof ApiError) {
    logger.error(
      `Failed to get all maps: ${allMaps.error.message} [Code ${allMaps.error.code}]`,
    );
    return [];
  }
  logger.info(`Found ${allMaps.data.length} total maps`)

  const transitionLocations = allMaps.data.filter(
    (map) => map.interactions.transition !== undefined && map.interactions.transition !== null,
  );

  logger.info(`Found ${transitionLocations.length} transition maps`);

  return transitionLocations;
}

/**
 * Array of all the transition maps:
 * - 571: mountain_6 = to Mithril/Bat cave
 * - 572: mine_1 = from Mithril/Bat cave
 * - 1093: forest_coastline1 = Mainland to Sandwhisper Isle
 * - 1336: desertisland_16 = Sandwhisper Isle to Mainland
 * @todo Find a way to get this programmatically
 */
export const TransitionLocationsHardcoded: MapSchema[] = [
  {
    map_id: 571,
    name: 'Mountain',
    skin: 'mountain_6',
    x: -2,
    y: 6,
    layer: 'overworld',
    access: {
      type: 'standard',
      conditions: [],
    },
    interactions: {
      content: null,
      transition: {
        map_id: 572,
        x: -2,
        y: 6,
        layer: 'underground',
        conditions: [],
      },
    },
  },
  {
    map_id: 572,
    name: 'Underground',
    skin: 'mine_1',
    x: -2,
    y: 6,
    layer: 'underground',
    access: {
      type: 'standard',
      conditions: [],
    },
    interactions: {
      content: null,
      transition: {
        map_id: 571,
        x: -2,
        y: 6,
        layer: 'overworld',
        conditions: [],
      },
    },
  },
  {
    map_id: 1093,
    name: 'Forest',
    skin: 'forest_coastline1',
    x: 2,
    y: 16,
    layer: 'overworld',
    access: {
      type: 'standard',
      conditions: [],
    },
    interactions: {
      content: null,
      transition: {
        map_id: 1336,
        x: -2,
        y: 21,
        layer: 'overworld',
        conditions: [
          {
            code: 'gold',
            operator: 'cost',
            value: '1000',
          },
        ],
      },
    },
  },
  {
    map_id: 1336,
    name: 'Sandwhisper Isle',
    skin: 'desertisland_16',
    x: -2,
    y: 21,
    layer: 'overworld',
    access: {
      type: 'standard',
      conditions: [],
    },
    interactions: {
      content: null,
      transition: {
        map_id: 1093,
        x: 2,
        y: 16,
        layer: 'overworld',
        conditions: [
          {
            code: 'gold',
            operator: 'cost',
            value: '1000',
          },
        ],
      },
    },
  },
];

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
 * @description checks to see if we're working with any skill
 */
export function isSkill(value: string): value is CraftSkill | GatheringSkill {
  return isCraftingSkill(value) || isGatheringSkill(value);
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
 * @description checks to see if we're working with a crafting skill
 * @param value the skill to check
 * @returns true if the provided skill is a crafting skill
 */
export function isCraftingSkill(value: string): value is CraftSkill {
  return [
    'mining',
    'woodcutting',
    'weaponcrafting',
    'gearcrafting',
    'jewelrycrafting',
    'cooking',
    'alchemy',
  ].includes(value);
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
    logger.error(
      `Failed to build list of useful ${itemType}: ${allItems.error.message} [Code: ${allItems.error.code}]`,
    );
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
      break;
    }

    charDetails.push(charDetail);
  }

  return charDetails;
}
