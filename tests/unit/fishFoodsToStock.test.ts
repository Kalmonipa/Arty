import { fishFoodsToStock } from '../../src/idleObjectives/idle.utils.js';
import { ItemSchema } from '../../src/types/types.js';

const fishingDrops = new Set(['bass', 'salmon', 'trout', 'swordfish']);

function food(
  code: string,
  craftLevel: number,
  heal: number,
  items: { code: string; quantity: number }[],
  outputPerCraft = 1,
): ItemSchema {
  return {
    name: code,
    code,
    level: craftLevel,
    type: 'consumable',
    subtype: 'food',
    description: '',
    conditions: [],
    effects: [{ code: 'heal', value: heal, description: '' }],
    craft: {
      skill: 'cooking',
      level: craftLevel,
      items,
      quantity: outputPerCraft,
    },
    tradeable: true,
  } as unknown as ItemSchema;
}

const cookedBass = food('cooked_bass', 30, 300, [
  { code: 'bass', quantity: 1 },
]);
const cookedSalmon = food('cooked_salmon', 40, 400, [
  { code: 'salmon', quantity: 1 },
]);
const fishSoup = food(
  'fish_soup',
  40,
  500,
  [
    { code: 'milk_bucket', quantity: 1 },
    { code: 'salmon', quantity: 1 },
    { code: 'trout', quantity: 1 },
  ],
  3,
);
const cookedSwordfish = food('cooked_swordfish', 50, 500, [
  { code: 'swordfish', quantity: 1 },
]);

const bounds = {
  fishingLevel: 49,
  highestCharLevel: 46,
  lowestCharLevel: 37,
};

describe('fishFoodsToStock', () => {
  it('puts the food that heals the most first', () => {
    const order = fishFoodsToStock(
      [cookedBass, cookedSalmon, fishSoup],
      fishingDrops,
      bounds,
    );

    expect(order.map((item) => item.code)).toEqual([
      'fish_soup',
      'cooked_salmon',
      'cooked_bass',
    ]);
  });

  it('breaks a heal tie on the recipe that yields more per craft', () => {
    const order = fishFoodsToStock([cookedSwordfish, fishSoup], fishingDrops, {
      ...bounds,
      fishingLevel: 60,
      highestCharLevel: 55,
    });

    expect(order.map((item) => item.code)).toEqual([
      'fish_soup',
      'cooked_swordfish',
    ]);
  });

  it('leaves out food that needs a higher fishing level than the cook has', () => {
    const order = fishFoodsToStock(
      [cookedBass, cookedSwordfish],
      fishingDrops,
      bounds,
    );

    expect(order.map((item) => item.code)).toEqual(['cooked_bass']);
  });

  it('leaves out food nobody in the fleet has levelled up to', () => {
    const order = fishFoodsToStock([cookedBass, cookedSalmon], fishingDrops, {
      ...bounds,
      highestCharLevel: 35,
    });

    expect(order.map((item) => item.code)).toEqual(['cooked_bass']);
  });

  it('leaves out food too far below the lowest character to be worth cooking', () => {
    const cookedTrout = food('cooked_trout', 20, 225, [
      { code: 'trout', quantity: 1 },
    ]);

    const order = fishFoodsToStock(
      [cookedTrout, cookedBass],
      fishingDrops,
      bounds,
    );

    expect(order.map((item) => item.code)).toEqual(['cooked_bass']);
  });

  it('leaves out consumables that are not cooked from fish', () => {
    const cookedBeef = food('cooked_beef', 30, 350, [
      { code: 'raw_beef', quantity: 1 },
    ]);
    const potion = {
      ...food('health_potion', 30, 0, [{ code: 'algae', quantity: 1 }]),
      craft: {
        skill: 'alchemy',
        level: 30,
        items: [{ code: 'algae', quantity: 1 }],
        quantity: 1,
      },
    } as unknown as ItemSchema;

    const order = fishFoodsToStock(
      [cookedBeef, potion, cookedBass],
      fishingDrops,
      bounds,
    );

    expect(order.map((item) => item.code)).toEqual(['cooked_bass']);
  });

  it('leaves out items that cannot be crafted at all', () => {
    const apple = {
      ...food('apple', 1, 50, []),
      craft: null,
    } as unknown as ItemSchema;

    const order = fishFoodsToStock([apple, cookedBass], fishingDrops, bounds);

    expect(order.map((item) => item.code)).toEqual(['cooked_bass']);
  });
});
