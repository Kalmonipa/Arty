import * as fs from 'node:fs/promises';
import path from 'node:path';
import { getItemInformation } from '../api_calls/Items.js';
import { getResourceNodesDropping } from '../api_calls/Resources.js';
import { ApiError } from '../core/Error.js';
import { EventSchema, MapContentType } from '../types/types.js';
import { logger } from '../utils.js';
import type { Character } from '../character/character.js';

/**
 * Path to the game state file containing events, written by the
 * pull-gamestate script.
 */
const eventStateFilePath: string = path.join(
  process.cwd(),
  'data',
  'events-data.json',
);

/**
 * Codes of every monster and resource that only ever spawns as an event. Read
 * from disk once and kept for the process lifetime — the event table is static
 * for the season, and this is consulted on every craft.
 */
let eventContentCodes: Set<string> | undefined;

/** Test seam: drop the cached events so each test starts from a clean read. */
export function clearEventContentCache(): void {
  eventContentCodes = undefined;
}

async function loadEventContentCodes(): Promise<Set<string>> {
  if (eventContentCodes) {
    return eventContentCodes;
  }

  try {
    const fileContent = await fs.readFile(eventStateFilePath, 'utf-8');
    const events: EventSchema[] = JSON.parse(fileContent);

    eventContentCodes = new Set(
      events.flatMap((event) =>
        event.content?.type === MapContentType.monster ||
        event.content?.type === MapContentType.resource
          ? [event.content.code]
          : [],
      ),
    );

    logger.info(
      `Loaded ${eventContentCodes.size} event monsters and resources from ${eventStateFilePath}`,
    );
  } catch (error) {
    // Without the file we can't tell event content apart, so nothing is
    // blocked and the fleet behaves as it did before this check existed
    logger.warn(
      `Could not read ${eventStateFilePath}, so event-only drops won't be detected: ${error}`,
    );
    eventContentCodes = new Set();
  }

  return eventContentCodes;
}

/**
 * @description Whether the monster or resource node only spawns as an event
 * @param code the monster or resource code
 */
export async function isEventContent(code: string): Promise<boolean> {
  return (await loadEventContentCodes()).has(code);
}

/**
 * @description Whether every source of an item is event content. Event mobs and
 * nodes have no permanent map, so farming one is a matter of luck and timing —
 * a job that needs the drop spins on "Cannot find any maps" until something
 * gives up.
 * @param itemCode the drop to trace back to its sources
 * @returns true only when the item has sources and all of them are events
 */
export async function isEventOnlyDrop(
  itemCode: string,
  character: Character,
): Promise<boolean> {
  const eventCodes = await loadEventContentCodes();
  if (eventCodes.size === 0) {
    return false;
  }

  const nodes = await getResourceNodesDropping(itemCode);
  if (nodes instanceof ApiError) {
    logger.warn(
      `Failed to load nodes dropping ${itemCode}: ${nodes.message}. Treating it as obtainable`,
    );
    return false;
  }

  const sources = [
    ...(character.monsterData ?? [])
      .filter((mob) => mob.drops.some((drop) => drop.code === itemCode))
      .map((mob) => mob.code),
    ...nodes.map((node) => node.code),
  ];

  return sources.length > 0 && sources.every((code) => eventCodes.has(code));
}

/**
 * @description Walks a recipe looking for ingredients that only drop from event
 * content and aren't already stocked. Sub-crafts are followed so a recipe gated
 * a couple of levels down is caught before any gathering starts, and an
 * ingredient the bank already covers ends that branch of the walk.
 * @param itemCode the item we want to craft
 * @param quantity how many of it are wanted
 * @returns the blocking ingredient codes, empty when the craft can go ahead
 */
export async function eventBlockedIngredients(
  itemCode: string,
  quantity: number,
  character: Character,
): Promise<string[]> {
  const blocked = new Set<string>();
  await collectBlockedIngredients(
    itemCode,
    quantity,
    character,
    blocked,
    new Set(),
  );
  return [...blocked];
}

async function collectBlockedIngredients(
  itemCode: string,
  quantity: number,
  character: Character,
  blocked: Set<string>,
  visited: Set<string>,
): Promise<void> {
  if (visited.has(itemCode)) {
    return;
  }
  visited.add(itemCode);

  const itemInfo = await getItemInformation(itemCode);
  if (itemInfo instanceof ApiError || !itemInfo?.craft) {
    return;
  }

  const craftsNeeded = Math.ceil(quantity / (itemInfo.craft.quantity ?? 1));

  for (const ingredient of itemInfo.craft.items) {
    const needed = ingredient.quantity * craftsNeeded;
    const held =
      character.checkQuantityOfItemInInv(ingredient.code) +
      (await character.checkQuantityOfItemInBank(ingredient.code));

    if (held >= needed) {
      continue;
    }

    if (await isEventOnlyDrop(ingredient.code, character)) {
      blocked.add(ingredient.code);
      continue;
    }

    await collectBlockedIngredients(
      ingredient.code,
      needed - held,
      character,
      blocked,
      visited,
    );
  }
}
