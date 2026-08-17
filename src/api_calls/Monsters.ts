import { ApiError } from '../core/Error.js';
import {
  StaticDataPageMonsterSchema,
  GetAllMonstersMonstersGetParams,
  MonsterResponseSchema,
  MonsterSchema,
} from '../types/types.js';
import { ApiUrl } from '../constants.js';
import { apiRequest } from './request.js';

/**
 * Monster data is static, so once fetched it is cached by code for the lifetime
 * of the process. Warmed in bulk by getAllMonsterInformation (Character.init
 * loads the full monster list) and read by getMonsterInformation to avoid
 * per-monster API calls during combat gear/loadout evaluation.
 */
const monsterCache = new Map<string, MonsterResponseSchema>();

/**
 * Every monster in the game, held for the lifetime of the process.
 *
 * `/monsters` is a static catalogue: it returns every monster whether or not
 * that monster's event is currently running, and MonsterSchema carries no event
 * marker at all. So one fetch answers every filter the fleet ever asks for, and
 * filtering locally returns exactly what the endpoint would have.
 *
 * Note this means a `drop` lookup can name an event-only mob (demon, full moon
 * vampire) while its event is off — but that was equally true of the live
 * endpoint. Whether the mob is reachable is a question for the map data, which
 * is where the fight objective already fails closed.
 */
let monsterCatalogue: MonsterSchema[] | undefined;

/** The API's own default when a caller names no page size. */
const DefaultPageSize = 50;

/** Well above the ~58 monsters in the game, so the catalogue is one request. */
const CataloguePageSize = 1000;

/** Test seam: drop the cached monsters so each test starts from a clean fetch. */
export function clearMonsterCache(): void {
  monsterCache.clear();
  monsterCatalogue = undefined;
}

/**
 * Fetches every monster once and warms both caches. Pages through the response
 * rather than assuming one page, so a game that grows past CataloguePageSize
 * still loads completely instead of silently truncating.
 */
async function loadMonsterCatalogue(): Promise<MonsterSchema[] | ApiError> {
  if (monsterCatalogue) {
    return monsterCatalogue;
  }

  const monsters: MonsterSchema[] = [];
  let page = 1;
  let pages = 1;

  do {
    const apiUrl = new URL(`${ApiUrl}/monsters`);
    apiUrl.searchParams.set('size', CataloguePageSize.toString());
    apiUrl.searchParams.set('page', page.toString());

    const res = await apiRequest<StaticDataPageMonsterSchema>({
      url: apiUrl,
      fallbackMessage: `Unknown error from /monsters`,
    });

    if (res instanceof ApiError) {
      return res;
    }

    monsters.push(...res.data);
    pages = res.pages;
    page++;
  } while (page <= pages);

  for (const monster of monsters) {
    monsterCache.set(monster.code, { data: monster });
  }

  monsterCatalogue = monsters;
  return monsterCatalogue;
}

/**
 * Answers a monster list query from the in-memory catalogue.
 *
 * Filter behaviour was verified against the live API on 2026-08-17: min_level
 * and max_level are inclusive at both ends, `drop` is an exact item-code match,
 * and `name` is a case-insensitive substring match. Falsy params are ignored,
 * matching both the API's defaults and the previous implementation (which only
 * put a param on the query string when it was truthy, so min_level: 0 was never
 * sent).
 */
export async function getAllMonsterInformation(
  data: GetAllMonstersMonstersGetParams,
): Promise<StaticDataPageMonsterSchema | ApiError> {
  const catalogue = await loadMonsterCatalogue();

  if (catalogue instanceof ApiError) {
    return catalogue;
  }

  const { drop, min_level, max_level, name } = data;
  let matches = catalogue;

  if (drop) {
    matches = matches.filter((monster) =>
      monster.drops.some((monsterDrop) => monsterDrop.code === drop),
    );
  }
  if (min_level) {
    matches = matches.filter((monster) => monster.level >= min_level);
  }
  if (max_level) {
    matches = matches.filter((monster) => monster.level <= max_level);
  }
  if (name) {
    const needle = name.toLowerCase();
    matches = matches.filter((monster) =>
      monster.name.toLowerCase().includes(needle),
    );
  }

  const size = data.size || DefaultPageSize;
  const page = data.page || 1;
  const start = (page - 1) * size;

  return {
    data: matches.slice(start, start + size),
    total: matches.length,
    page,
    size,
    pages: Math.ceil(matches.length / size),
  };
}

export async function getMonsterInformation(
  monsterCode: string,
): Promise<MonsterResponseSchema | ApiError> {
  const cached = monsterCache.get(monsterCode);
  if (cached) {
    return cached;
  }

  const apiUrl = new URL(`${ApiUrl}/monsters/${monsterCode}`);

  const res = await apiRequest<MonsterResponseSchema>({
    url: apiUrl,
    errorMessages: {
      404: `Monster not found: ${monsterCode}`,
    },
    fallbackMessage: `Unknown error from /monsters`,
  });

  if (res instanceof ApiError) {
    return res;
  }

  monsterCache.set(monsterCode, res);
  return res;
}
