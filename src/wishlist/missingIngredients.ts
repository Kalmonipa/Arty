import { getItemInformation } from '../api_calls/Items.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/error.js';
import { ItemSchema } from '../types/types.js';

/** An ingredient a craft came up short on, and the nearest thing to a why */
export type MissingIngredient = {
  code: string;
  quantity: number;
  reason: string;
};

/** How far down a recipe tree to look before giving up on naming a cause */
const MaxRecipeDepth = 4;

/**
 * @description The ingredients a craft could not lay hands on, so a failed
 * wishlist fulfilment can say what it was short of rather than just failing.
 *
 * Walks the recipe against the bank: an ingredient that is itself craftable is
 * followed down, anything else that the bank cannot cover is reported. The
 * quantities are the shortfall, not the recipe amount, so an item the bank half
 * covers reads honestly.
 *
 * This is diagnostic only — it decides nothing, so it errs towards saying
 * nothing rather than guessing when the catalogue can't be read.
 */
export async function missingIngredientsFor(
  character: Character,
  itemCode: string,
  quantity: number,
): Promise<MissingIngredient[]> {
  const banked = new Map<string, number>();

  const heldOf = async (code: string): Promise<number> => {
    if (!banked.has(code)) {
      banked.set(
        code,
        (await character.checkQuantityOfItemInBank(code)) +
          character.checkQuantityOfItemInInv(code),
      );
    }
    return banked.get(code) ?? 0;
  };

  // Claimed as we go, so two ingredients sharing a material don't both count the
  // same banked units towards themselves
  const claim = async (code: string, wanted: number): Promise<number> => {
    const held = await heldOf(code);
    const used = Math.min(held, wanted);
    banked.set(code, held - used);
    return wanted - used;
  };

  const found = new Map<string, MissingIngredient>();

  const walk = async (
    code: string,
    needed: number,
    depth: number,
  ): Promise<void> => {
    const info = await itemOrUndefined(code);
    if (!info?.craft?.items?.length || depth >= MaxRecipeDepth) {
      return;
    }

    // A recipe can yield more than one per craft, so round up the runs needed
    const perCraft = info.craft.quantity || 1;
    const runs = Math.ceil(needed / perCraft);

    for (const ingredient of info.craft.items) {
      const shortfall = await claim(
        ingredient.code,
        ingredient.quantity * runs,
      );
      if (shortfall <= 0) continue;

      const ingredientInfo = await itemOrUndefined(ingredient.code);
      if (ingredientInfo?.craft?.items?.length) {
        await walk(ingredient.code, shortfall, depth + 1);
        continue;
      }

      const existing = found.get(ingredient.code);
      if (existing) {
        existing.quantity += shortfall;
        continue;
      }
      found.set(ingredient.code, {
        code: ingredient.code,
        quantity: shortfall,
        reason: reasonFor(ingredient.code, ingredientInfo, character),
      });
    }
  };

  await walk(itemCode, quantity, 0);
  return [...found.values()];
}

async function itemOrUndefined(code: string): Promise<ItemSchema | undefined> {
  const info = await getItemInformation(code);
  return info instanceof ApiError || !info ? undefined : info;
}

/**
 * @description Why an ingredient could not be had, in the terms that decide what
 * to do about it: buy it, fight something, or go and gather.
 */
function reasonFor(
  code: string,
  info: ItemSchema | undefined,
  character: Character,
): string {
  if (info?.subtype === 'task') {
    return 'only sold by the task shop';
  }

  const droppers = (character.monsterData ?? []).filter((mob) =>
    mob.drops?.some((drop) => drop.code === code),
  );

  if (droppers.length > 0 && droppers.every((mob) => mob.type === 'boss')) {
    return `only drops from the boss ${droppers.map((mob) => mob.code).join(', ')}`;
  }

  return 'none in the bank';
}
