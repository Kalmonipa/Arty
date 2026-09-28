import type { Character } from '../character/character.js';
import { isEventContent } from '../events/events.cache.js';
import { DropRateSchema, MonsterSchema, MonsterType } from '../types/types.js';
import { logger } from '../utils.js';

/** Expected fights per unit of the drop. Lower is a faster farm. */
function fightsPerUnit(drop: DropRateSchema): number {
  const averageYield = (drop.min_quantity + drop.max_quantity) / 2;
  return drop.rate / averageYield;
}

/**
 * @description The mobs a character can actually farm for a drop, fastest first.
 *
 * Ordinary mobs share drop tables with event mobs and bosses — owlbear_claw
 * comes off both `owlbear` and the event-only `corrupted_owlbear` — and the
 * monster catalogue lists them in no useful order, so taking the first match
 * sent characters after a mob with no permanent map. That fails on "Cannot find
 * any maps" and the job gets re-queued, which reads as a character stuck in a
 * loop. Bosses are excluded for the same reason as in the crafting cost model:
 * the fleet has no reliable way to farm them.
 *
 * @param monsters the droppers to choose between, already level-filtered
 * @param character whose map snapshot decides what is reachable
 * @param itemCode the drop being farmed
 */
export async function selectMobsForDrop(
  monsters: MonsterSchema[],
  character: Character,
  itemCode: string,
): Promise<MonsterSchema[]> {
  const candidates: { mob: MonsterSchema; fights: number }[] = [];

  for (const mob of monsters) {
    const drop = mob.drops.find((mobDrop) => mobDrop.code === itemCode);
    if (!drop) {
      continue;
    }

    if (mob.type === MonsterType.boss) {
      logger.debug(`Skipping ${mob.code} as a boss cannot be farmed`);
      continue;
    }

    if (await isEventContent(mob.code)) {
      logger.debug(`Skipping ${mob.code} as it only spawns as an event`);
      continue;
    }

    if (character.findMaps({ content_code: mob.code }).length === 0) {
      logger.debug(`Skipping ${mob.code} as it has no permanent map`);
      continue;
    }

    candidates.push({ mob, fights: fightsPerUnit(drop) });
  }

  return candidates
    .sort((a, b) => a.fights - b.fights || a.mob.level - b.mob.level)
    .map(({ mob }) => mob);
}
