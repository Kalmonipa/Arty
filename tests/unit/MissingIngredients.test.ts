import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
}));

import { getItemInformation } from '../../src/api_calls/Items.js';
import { missingIngredientsFor } from '../../src/wishlist/missingIngredients.js';
import { Character } from '../../src/character/character.js';

const mockedGetItem = getItemInformation as jest.MockedFunction<
  typeof getItemInformation
>;

const CATALOGUE: Record<string, unknown> = {
  earth_shield: {
    code: 'earth_shield',
    level: 40,
    subtype: '',
    craft: {
      skill: 'gearcrafting',
      level: 40,
      quantity: 1,
      items: [
        { code: 'strangold_bar', quantity: 6 },
        { code: 'rosenblood_elixir', quantity: 1 },
      ],
    },
  },
  greater_emerald_amulet: {
    code: 'greater_emerald_amulet',
    level: 40,
    subtype: '',
    craft: {
      skill: 'jewelrycrafting',
      level: 40,
      quantity: 1,
      items: [
        { code: 'emerald_amulet', quantity: 1 },
        { code: 'astralyte_crystal', quantity: 2 },
      ],
    },
  },
  emerald_amulet: {
    code: 'emerald_amulet',
    level: 30,
    subtype: '',
    craft: {
      skill: 'jewelrycrafting',
      level: 30,
      quantity: 1,
      items: [{ code: 'jasper_crystal', quantity: 2 }],
    },
  },
  strangold_bar: { code: 'strangold_bar', level: 40, subtype: '', craft: null },
  rosenblood_elixir: {
    code: 'rosenblood_elixir',
    level: 40,
    subtype: '',
    craft: null,
  },
  astralyte_crystal: {
    code: 'astralyte_crystal',
    level: 10,
    subtype: 'task',
    craft: null,
  },
  jasper_crystal: {
    code: 'jasper_crystal',
    level: 10,
    subtype: 'task',
    craft: null,
  },
};

const monsterData = [
  { code: 'rosenblood', type: 'boss', drops: [{ code: 'rosenblood_elixir' }] },
  { code: 'bandit', type: 'monster', drops: [{ code: 'strangold_bar' }] },
];

const characterWith = (bank: Record<string, number>) =>
  ({
    monsterData,
    checkQuantityOfItemInBank: jest.fn(async (code: string) => bank[code] ?? 0),
    checkQuantityOfItemInInv: () => 0,
  }) as unknown as Character;

describe('missingIngredientsFor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetItem.mockImplementation(
      async (code: string) => (CATALOGUE[code] ?? undefined) as never,
    );
  });

  it('names the ingredient the bank has none of', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ strangold_bar: 63 }),
      'earth_shield',
      1,
    );

    expect(missing.map((m) => m.code)).toEqual(['rosenblood_elixir']);
    expect(missing[0].quantity).toBe(1);
  });

  it('says when the only droppers are bosses', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ strangold_bar: 63 }),
      'earth_shield',
      1,
    );

    expect(missing[0].reason).toMatch(/boss/i);
  });

  it('says when an ingredient comes from the task shop', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ jasper_crystal: 99 }),
      'greater_emerald_amulet',
      1,
    );

    const crystal = missing.find((m) => m.code === 'astralyte_crystal');
    expect(crystal?.reason).toMatch(/task shop/i);
  });

  it('recurses through a craftable sub-ingredient', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ astralyte_crystal: 99 }),
      'greater_emerald_amulet',
      1,
    );

    // emerald_amulet is craftable, so the shortfall is its jasper_crystal
    expect(missing.map((m) => m.code)).toEqual(['jasper_crystal']);
    expect(missing[0].quantity).toBe(2);
  });

  it('scales the shortfall with the quantity requested', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ strangold_bar: 999 }),
      'earth_shield',
      3,
    );

    expect(missing[0].quantity).toBe(3);
  });

  it('reports nothing when the bank covers everything', async () => {
    const missing = await missingIngredientsFor(
      characterWith({ strangold_bar: 63, rosenblood_elixir: 4 }),
      'earth_shield',
      1,
    );

    expect(missing).toEqual([]);
  });

  it('reports nothing rather than throwing on an unknown item', async () => {
    mockedGetItem.mockImplementation(async () => undefined as never);

    expect(
      await missingIngredientsFor(characterWith({}), 'mystery_thing', 1),
    ).toEqual([]);
  });
});
