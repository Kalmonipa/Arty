import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getAllItemInformation: jest.fn(),
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources.js', () => ({
  getResourceNodesDropping: jest.fn(),
}));

jest.mock('../../src/api_calls/NPC.js', () => ({
  getAllNpcItems: jest.fn(),
}));

import { getItemInformation } from '../../src/api_calls/Items.js';
import { getResourceNodesDropping } from '../../src/api_calls/Resources.js';
import { getAllNpcItems } from '../../src/api_calls/NPC.js';
import {
  calculateScore,
  calculateBestCraftingItem,
  GOLD_PER_ACTION,
  TASK_REWARD_ACTIONS,
  UNATTAINABLE,
} from '../../src/core/TrainCraftingSkillObjective.js';
import { BankCache } from '../../src/core/BankCache.js';
import { Character } from '../../src/character/CharacterClass.js';
import {
  EventSchema,
  ItemSchema,
  MonsterSchema,
  NPCItemSchema,
  ResourceSchema,
} from '../../src/types/types.js';
import * as fs from 'node:fs/promises';
import { clearEventContentCache } from '../../src/events/eventContent.js';

type Ingredient = [code: string, quantity: number];

const material = (
  code: string,
  subtype: string,
  craft?: Ingredient[],
): ItemSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'resource',
    subtype,
    ...(craft
      ? {
          craft: {
            skill: 'mining',
            level: 30,
            items: craft.map(([c, quantity]) => ({ code: c, quantity })),
            quantity: 1,
          },
        }
      : {}),
  }) as ItemSchema;

const equipment = (code: string, craft: Ingredient[]): ItemSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'amulet',
    subtype: '',
    craft: {
      skill: 'jewelrycrafting',
      level: 30,
      items: craft.map(([c, quantity]) => ({ code: c, quantity })),
      quantity: 1,
    },
  }) as ItemSchema;

const monster = (
  code: string,
  drops: { code: string; rate: number; max?: number }[],
  type = 'normal',
): MonsterSchema =>
  ({
    code,
    name: code,
    level: 30,
    type,
    drops: drops.map((d) => ({
      code: d.code,
      rate: d.rate,
      min_quantity: 1,
      max_quantity: d.max ?? 1,
    })),
  }) as MonsterSchema;

const node = (
  code: string,
  drops: { code: string; rate: number }[],
): ResourceSchema =>
  ({
    code,
    name: code,
    skill: 'mining',
    level: 30,
    drops: drops.map((d) => ({
      code: d.code,
      rate: d.rate,
      min_quantity: 1,
      max_quantity: 1,
    })),
  }) as ResourceSchema;

const offer = (
  code: string,
  buy_price: number,
  currency: string,
): NPCItemSchema => ({ code, npc: 'tailor', currency, buy_price });

/** Wires the mocked item/resource lookups to a fixed world and returns a character. */
const world = ({
  items,
  monsters = [],
  nodes = [],
  offers = [],
  canFight = true,
}: {
  items: ItemSchema[];
  monsters?: MonsterSchema[];
  nodes?: ResourceSchema[];
  offers?: NPCItemSchema[];
  canFight?: boolean;
}): Character => {
  const byCode = new Map(items.map((i) => [i.code, i]));

  jest
    .mocked(getItemInformation)
    .mockImplementation(async (code: string) => byCode.get(code) as ItemSchema);

  jest
    .mocked(getResourceNodesDropping)
    .mockImplementation(async (code: string) =>
      nodes.filter((n) => n.drops.some((d) => d.code === code)),
    );

  jest.mocked(getAllNpcItems).mockImplementation(async ({ code }) => {
    const matching = offers.filter((o) => o.code === code);
    return {
      data: matching,
      total: matching.length,
      page: 1,
      size: 50,
      pages: 1,
    };
  });

  return {
    data: { name: 'LongLegLarry' },
    monsterData: monsters,
    proposeCombatLoadout: jest.fn(async () => ({})),
    simulateFightNow: jest.fn(async () => canFight),
  } as unknown as Character;
};

const emptyBank = () => BankCache.fromItems([]);

/** The events the pull-gamestate script would have written to disk. */
const withEventsFile = (events: EventSchema[]) => {
  clearEventContentCache();
  (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(
    JSON.stringify(events) as never,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  // Every other test in here costs items without any event in play
  withEventsFile([]);
});

describe('crafting cost model', () => {
  it('prices a mob drop nested behind a bar by its drop rate, not a flat 1', async () => {
    const character = world({
      items: [
        material('piece_of_obsidian', 'mob'),
        material('obsidian_bar', 'bar', [['piece_of_obsidian', 4]]),
        equipment('nested_amulet', [['obsidian_bar', 1]]),
      ],
      monsters: [monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }])],
    });

    const score = await calculateScore(
      (await getItemInformation('nested_amulet')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    // 1 craft action for the amulet + (1 craft action for the bar + 4 pieces x 12 fights)
    expect(score).toBe(50);
  });

  it('multiplies the cost of a crafted ingredient by the quantity needed', async () => {
    const character = world({
      items: [
        material('piece_of_obsidian', 'mob'),
        material('obsidian_bar', 'bar', [['piece_of_obsidian', 4]]),
        equipment('one_bar', [['obsidian_bar', 1]]),
        equipment('four_bars', [['obsidian_bar', 4]]),
      ],
      monsters: [monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }])],
    });

    const one = await calculateScore(
      (await getItemInformation('one_bar')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );
    const four = await calculateScore(
      (await getItemInformation('four_bars')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(one).toBe(1 + 49);
    expect(four).toBe(1 + 4 * 49);
  });

  it('prices a gathered material by its node drop rate', async () => {
    const character = world({
      items: [
        material('gold_ore', 'mining'),
        material('rare_ore', 'mining'),
        material('gold_bar', 'bar', [['gold_ore', 10]]),
        material('rare_bar', 'bar', [['rare_ore', 10]]),
        equipment('gold_amulet', [['gold_bar', 1]]),
        equipment('rare_amulet', [['rare_bar', 1]]),
      ],
      nodes: [
        node('gold_rocks', [{ code: 'gold_ore', rate: 1 }]),
        node('rare_rocks', [{ code: 'rare_ore', rate: 20 }]),
      ],
    });

    const gold = await calculateScore(
      (await getItemInformation('gold_amulet')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );
    const rare = await calculateScore(
      (await getItemInformation('rare_amulet')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(gold).toBe(1 + 1 + 10 * 1);
    expect(rare).toBe(1 + 1 + 10 * 20);
  });

  it('averages the quantity a drop yields into its cost', async () => {
    const character = world({
      items: [material('piece_of_obsidian', 'mob')],
      monsters: [
        monster('demon', [{ code: 'piece_of_obsidian', rate: 12, max: 2 }]),
      ],
    });

    const score = await calculateScore(
      (await getItemInformation('piece_of_obsidian')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    // 1/12 chance of 1-2 pieces averages 1.5 per drop, so 8 fights per piece
    expect(score).toBe(8);
  });

  it('takes the cheapest monster when several drop the same material', async () => {
    const character = world({
      items: [material('piece_of_obsidian', 'mob')],
      monsters: [
        monster('imp', [{ code: 'piece_of_obsidian', rate: 50 }]),
        monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }]),
      ],
    });

    const score = await calculateScore(
      (await getItemInformation('piece_of_obsidian')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBe(12);
  });

  it('marks a boss drop unattainable even when nested inside another recipe', async () => {
    const character = world({
      items: [
        material('king_slimeball', 'mob'),
        equipment('dreadful_amulet', [['king_slimeball', 2]]),
        equipment('greater_dreadful_amulet', [['dreadful_amulet', 1]]),
      ],
      monsters: [
        monster('king_slime', [{ code: 'king_slimeball', rate: 12 }], 'boss'),
      ],
    });

    const score = await calculateScore(
      (await getItemInformation('greater_dreadful_amulet')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('marks an event mob drop unattainable, however killable the mob is', async () => {
    withEventsFile([
      {
        code: 'portal_demon',
        name: 'Portal',
        content: { type: 'monster', code: 'demon' },
      } as EventSchema,
    ]);
    const character = world({
      items: [material('demon_horn', 'mob')],
      monsters: [monster('demon', [{ code: 'demon_horn', rate: 10 }])],
    });

    const score = await calculateScore(
      (await getItemInformation('demon_horn')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('marks an event resource node unattainable', async () => {
    withEventsFile([
      {
        code: 'magic_apparition',
        name: 'Magic apparition',
        content: { type: 'resource', code: 'magic_tree' },
      } as EventSchema,
    ]);
    const character = world({
      items: [material('magic_wood', 'woodcutting')],
      nodes: [node('magic_tree', [{ code: 'magic_wood', rate: 10 }])],
    });

    const score = await calculateScore(
      (await getItemInformation('magic_wood')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('marks a material unattainable when the character cannot win the fight', async () => {
    const character = world({
      items: [material('piece_of_obsidian', 'mob')],
      monsters: [monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }])],
      canFight: false,
    });

    const score = await calculateScore(
      (await getItemInformation('piece_of_obsidian')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('prices an npc-bought material by the cost of the currency it asks for', async () => {
    const character = world({
      items: [material('snake_hide', 'mob'), material('snakeskin', 'npc')],
      monsters: [monster('flying_snake', [{ code: 'snake_hide', rate: 12 }])],
      offers: [offer('snakeskin', 4, 'snake_hide')],
    });

    const score = await calculateScore(
      (await getItemInformation('snakeskin')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    // 1 buy action + 4 hides at 12 fights each
    expect(score).toBe(1 + 4 * 12);
  });

  it('prices an npc-bought material nested inside a recipe', async () => {
    const character = world({
      items: [
        material('snake_hide', 'mob'),
        material('snakeskin', 'npc'),
        equipment('snakeskin_boots', [['snakeskin', 2]]),
      ],
      monsters: [monster('flying_snake', [{ code: 'snake_hide', rate: 12 }])],
      offers: [offer('snakeskin', 4, 'snake_hide')],
    });

    const score = await calculateScore(
      (await getItemInformation('snakeskin_boots')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBe(1 + 2 * 49);
  });

  it('converts a gold price into actions rather than treating gold as free', async () => {
    const character = world({
      items: [material('cloth', 'npc')],
      offers: [offer('cloth', 100, 'gold')],
    });

    const score = await calculateScore(
      (await getItemInformation('cloth')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBe(1 + 100 / GOLD_PER_ACTION);
  });

  it('takes the cheapest offer when several npcs sell the same material', async () => {
    const character = world({
      items: [material('rat_hide', 'mob'), material('vermin_leather', 'npc')],
      monsters: [monster('rat', [{ code: 'rat_hide', rate: 10 }])],
      offers: [
        offer('vermin_leather', 8, 'rat_hide'),
        offer('vermin_leather', 3, 'rat_hide'),
      ],
    });

    const score = await calculateScore(
      (await getItemInformation('vermin_leather')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBe(1 + 3 * 10);
  });

  it('marks an npc-subtype material unattainable when no npc sells it', async () => {
    const character = world({
      items: [material('unsold_thing', 'npc')],
      offers: [],
    });

    const score = await calculateScore(
      (await getItemInformation('unsold_thing')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('marks an npc material unattainable when its currency cannot be obtained', async () => {
    const character = world({
      items: [material('boss_hide', 'mob'), material('boss_leather', 'npc')],
      monsters: [
        monster('king_slime', [{ code: 'boss_hide', rate: 12 }], 'boss'),
      ],
      offers: [offer('boss_leather', 2, 'boss_hide')],
    });

    const score = await calculateScore(
      (await getItemInformation('boss_leather')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('does not recurse forever when two npc materials buy each other', async () => {
    const character = world({
      items: [material('yin', 'npc'), material('yang', 'npc')],
      offers: [offer('yin', 2, 'yang'), offer('yang', 2, 'yin')],
    });

    const score = await calculateScore(
      (await getItemInformation('yin')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    expect(score).toBeGreaterThanOrEqual(UNATTAINABLE);
  });

  it('scores each distinct material once per pass', async () => {
    const character = world({
      items: [
        material('piece_of_obsidian', 'mob'),
        material('obsidian_bar', 'bar', [['piece_of_obsidian', 4]]),
        equipment('amulet_a', [['obsidian_bar', 2]]),
        equipment('amulet_b', [['obsidian_bar', 3]]),
      ],
      monsters: [monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }])],
    });

    await calculateBestCraftingItem(
      character,
      [
        (await getItemInformation('amulet_a')) as ItemSchema,
        (await getItemInformation('amulet_b')) as ItemSchema,
      ],
      1,
      emptyBank(),
    );

    expect(character.simulateFightNow).toHaveBeenCalledTimes(1);
  });
});

describe('ingredients already in the bank', () => {
  /** An amulet of N obsidian bars, each smelted from 4 pieces at 12 fights a piece. */
  const obsidianWorld = () =>
    world({
      items: [
        material('piece_of_obsidian', 'mob'),
        material('obsidian_bar', 'bar', [['piece_of_obsidian', 4]]),
        equipment('four_bar_amulet', [['obsidian_bar', 4]]),
        equipment('one_bar_amulet', [['obsidian_bar', 1]]),
        equipment('mixed_amulet', [
          ['piece_of_obsidian', 2],
          ['obsidian_bar', 1],
        ]),
      ],
      monsters: [monster('demon', [{ code: 'piece_of_obsidian', rate: 12 }])],
    });

  it('charges nothing for an ingredient the bank already covers', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([{ code: 'obsidian_bar', quantity: 4 }]);

    const score = await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    expect(score).toBe(1);
  });

  it('charges only for the shortfall when the bank part-covers an ingredient', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([{ code: 'obsidian_bar', quantity: 1 }]);

    const score = await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    // 1 craft + the 3 bars we still have to make, at 49 each
    expect(score).toBe(1 + 3 * 49);
  });

  it('discounts a material nested inside an ingredient it still has to craft', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([
      { code: 'piece_of_obsidian', quantity: 4 },
    ]);

    const score = await calculateScore(
      (await getItemInformation('one_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    // The pieces are free, so all that is left is smelting the bar and crafting
    expect(score).toBe(2);
  });

  it('does not spend the same banked stack on two parts of one recipe', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([
      { code: 'piece_of_obsidian', quantity: 4 },
    ]);

    const score = await calculateScore(
      (await getItemInformation('mixed_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    // Needs 6 pieces in total (2 loose, 4 in the bar) and the bank covers 4,
    // so 2 are still fought for
    expect(score).toBe(1 + 1 + 2 * 12);
  });

  it('scores every candidate against the full bank, not the leftovers of the last', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([{ code: 'obsidian_bar', quantity: 4 }]);

    const first = await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );
    const second = await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    expect(second).toBe(first);
  });

  it('still charges for the item itself when a finished one is banked', async () => {
    const character = obsidianWorld();
    const stocked = BankCache.fromItems([
      { code: 'four_bar_amulet', quantity: 5 },
    ]);

    const score = await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      stocked,
      character,
      1,
    );

    // We craft to earn the XP, so owning one already saves nothing
    expect(score).toBe(1 + 4 * 49);
  });

  it('leaves the caller snapshot untouched so later reads still see the stock', async () => {
    const character = obsidianWorld();
    const bank = BankCache.fromItems([{ code: 'obsidian_bar', quantity: 4 }]);

    await calculateScore(
      (await getItemInformation('four_bar_amulet')) as ItemSchema,
      bank,
      character,
      1,
    );

    expect(bank.quantityOf('obsidian_bar')).toBe(4);
  });
});

describe('scoring the whole batch', () => {
  /**
   * A wand needing one task-reward crystal each, against a bow of the same level
   * that needs none. This is the skull_wand shortlist: the bank held one crystal.
   */
  const wandWorld = () =>
    world({
      items: [
        material('jasper_crystal', 'task'),
        material('spider_leg', 'mob'),
        equipment('skull_wand', [
          ['jasper_crystal', 1],
          ['spider_leg', 3],
        ]),
        equipment('vampire_bow', [['spider_leg', 4]]),
      ],
      monsters: [monster('spider', [{ code: 'spider_leg', rate: 10 }])],
    });

  const oneCrystal = () =>
    BankCache.fromItems([{ code: 'jasper_crystal', quantity: 1 }]);

  it('charges for the units the bank cannot cover', async () => {
    const character = wandWorld();
    const wand = (await getItemInformation('skull_wand')) as ItemSchema;

    const score = await calculateScore(wand, oneCrystal(), character, 5);

    // 5 crafts + 15 spider legs at 10 fights + the 4 crystals the bank is short
    expect(score).toBe(5 + 15 * 10 + 4 * TASK_REWARD_ACTIONS);
  });

  it('no longer reads as free when the bank covers a single unit', async () => {
    const character = wandWorld();
    const wand = (await getItemInformation('skull_wand')) as ItemSchema;

    const oneUnit = await calculateScore(wand, oneCrystal(), character, 1);
    const batch = await calculateScore(wand, oneCrystal(), character, 5);

    expect(oneUnit).toBe(1 + 3 * 10);
    expect(batch).toBeGreaterThan(5 * oneUnit);
  });

  it('prefers the recipe whose ingredients the fleet can actually repeat', async () => {
    const character = wandWorld();
    const shortlist = [
      (await getItemInformation('skull_wand')) as ItemSchema,
      (await getItemInformation('vampire_bow')) as ItemSchema,
    ];

    const best = await calculateBestCraftingItem(
      character,
      shortlist,
      5,
      oneCrystal(),
    );

    expect(best.code).toBe('vampire_bow');
  });

  it('still picks the wand when the bank covers the whole batch', async () => {
    const character = wandWorld();
    const shortlist = [
      (await getItemInformation('skull_wand')) as ItemSchema,
      (await getItemInformation('vampire_bow')) as ItemSchema,
    ];

    const best = await calculateBestCraftingItem(
      character,
      shortlist,
      5,
      BankCache.fromItems([{ code: 'jasper_crystal', quantity: 5 }]),
    );

    expect(best.code).toBe('skull_wand');
  });
});

describe('the lost_amulet regression', () => {
  /** The real level 30 jewelrycrafting shortlist Larry was choosing between. */
  const realWorld = () =>
    world({
      items: [
        material('gold_ore', 'mining'),
        material('dead_wood', 'woodcutting'),
        material('gold_bar', 'bar', [['gold_ore', 10]]),
        material('dead_wood_plank', 'plank', [['dead_wood', 10]]),
        material('piece_of_obsidian', 'mob'),
        material('obsidian_bar', 'bar', [['piece_of_obsidian', 4]]),
        material('cyclops_eye', 'mob'),
        material('imp_tail', 'mob'),
        material('red_cloth', 'mob'),
        material('wolf_bone', 'mob'),
        material('vampire_blood', 'mob'),
        material('skeleton_bone', 'mob'),
        equipment('lost_amulet', [
          ['gold_bar', 8],
          ['obsidian_bar', 4],
          ['cyclops_eye', 4],
          ['imp_tail', 3],
          ['red_cloth', 3],
        ]),
        equipment('gold_ring', [
          ['gold_bar', 8],
          ['dead_wood_plank', 3],
          ['wolf_bone', 3],
          ['vampire_blood', 3],
          ['skeleton_bone', 3],
        ]),
      ],
      monsters: [
        monster('imp', [
          { code: 'imp_tail', rate: 6 },
          { code: 'piece_of_obsidian', rate: 50, max: 2 },
        ]),
        monster('demon', [{ code: 'piece_of_obsidian', rate: 12, max: 2 }]),
        monster('cyclops', [{ code: 'cyclops_eye', rate: 6 }]),
        monster('death_knight', [{ code: 'red_cloth', rate: 12, max: 2 }]),
        monster('wolf', [{ code: 'wolf_bone', rate: 12, max: 2 }]),
        monster('vampire', [{ code: 'vampire_blood', rate: 12, max: 2 }]),
        monster('skeleton', [{ code: 'skeleton_bone', rate: 12, max: 2 }]),
      ],
      nodes: [
        node('gold_rocks', [{ code: 'gold_ore', rate: 1 }]),
        node('dead_tree', [{ code: 'dead_wood', rate: 1 }]),
      ],
    });

  it('costs the four obsidian bars far above the rest of the recipe', async () => {
    const character = realWorld();

    const obsidianBar = await calculateScore(
      (await getItemInformation('obsidian_bar')) as ItemSchema,
      emptyBank(),
      character,
      1,
    );

    // 4 pieces at 8 fights each, plus the smelt
    expect(obsidianBar).toBe(33);
  });

  it('no longer prefers lost_amulet over gold_ring', async () => {
    const character = realWorld();

    const best = await calculateBestCraftingItem(
      character,
      [
        (await getItemInformation('lost_amulet')) as ItemSchema,
        (await getItemInformation('gold_ring')) as ItemSchema,
      ],
      1,
      emptyBank(),
    );

    expect(best.code).toBe('gold_ring');
  });
});
