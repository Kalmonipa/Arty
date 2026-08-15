import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Resources.js', () => ({
  getResourceNodesDropping: jest.fn(),
}));

import path from 'node:path';
import * as fs from 'node:fs/promises';
import { getItemInformation } from '../../src/api_calls/Items.js';
import { getResourceNodesDropping } from '../../src/api_calls/Resources.js';
import {
  clearEventContentCache,
  eventBlockedIngredients,
  isEventContent,
  isEventOnlyDrop,
} from '../../src/events/eventContent.js';
import { Character } from '../../src/character/CharacterClass.js';
import {
  EventSchema,
  ItemSchema,
  MonsterSchema,
  ResourceSchema,
} from '../../src/types/types.js';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

type Ingredient = [code: string, quantity: number];

const drop = (code: string) => ({
  code,
  rate: 10,
  min_quantity: 1,
  max_quantity: 1,
});

const monster = (code: string, drops: string[]): MonsterSchema =>
  ({ code, name: code, level: 30, drops: drops.map(drop) }) as MonsterSchema;

const node = (code: string, drops: string[]): ResourceSchema =>
  ({
    code,
    name: code,
    skill: 'woodcutting',
    level: 30,
    drops: drops.map(drop),
  }) as ResourceSchema;

const item = (code: string, craft?: Ingredient[]): ItemSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'resource',
    subtype: 'mob',
    ...(craft
      ? {
          craft: {
            skill: 'gearcrafting',
            level: 30,
            items: craft.map(([c, quantity]) => ({ code: c, quantity })),
            quantity: 1,
          },
        }
      : {}),
  }) as ItemSchema;

const event = (code: string, type: string, contentCode: string): EventSchema =>
  ({
    code,
    name: code,
    content: { type, code: contentCode },
    duration: 60,
  }) as EventSchema;

/** The events the pull-gamestate script would have written to disk. */
const withEventsFile = (events: EventSchema[]) => {
  mockReadFile.mockResolvedValue(JSON.stringify(events) as never);
};

const world = ({
  items = [],
  monsters = [],
  nodes = [],
  inventory = {},
  bank = {},
}: {
  items?: ItemSchema[];
  monsters?: MonsterSchema[];
  nodes?: ResourceSchema[];
  inventory?: Record<string, number>;
  bank?: Record<string, number>;
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

  return {
    data: { name: 'LongLegLarry' },
    monsterData: monsters,
    checkQuantityOfItemInInv: (code: string) => inventory[code] ?? 0,
    checkQuantityOfItemInBank: async (code: string) => bank[code] ?? 0,
  } as unknown as Character;
};

const portalDemon = event('portal_demon', 'monster', 'demon');
const magicApparition = event('magic_apparition', 'resource', 'magic_tree');

beforeEach(() => {
  jest.clearAllMocks();
  clearEventContentCache();
});

describe('isEventContent', () => {
  it('reads the events file written by the pull-gamestate script', async () => {
    withEventsFile([portalDemon]);

    await isEventContent('demon');

    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(process.cwd(), 'data', 'events-data.json'),
      'utf-8',
    );
  });

  it('recognises event monsters and event resources', async () => {
    withEventsFile([portalDemon, magicApparition]);

    expect(await isEventContent('demon')).toBe(true);
    expect(await isEventContent('magic_tree')).toBe(true);
    expect(await isEventContent('chicken')).toBe(false);
  });

  it('ignores event content that is neither a monster nor a resource', async () => {
    withEventsFile([event('fish_merchant', 'npc', 'fish_merchant')]);

    expect(await isEventContent('fish_merchant')).toBe(false);
  });

  it('reads the file once and answers later calls from memory', async () => {
    withEventsFile([portalDemon]);

    await isEventContent('demon');
    await isEventContent('chicken');

    expect(mockReadFile).toHaveBeenCalledTimes(1);
  });

  it('treats nothing as event content when the file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);

    expect(await isEventContent('demon')).toBe(false);
  });
});

describe('isEventOnlyDrop', () => {
  it('flags a drop whose only source is an event monster', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      monsters: [monster('demon', ['demon_horn'])],
    });

    expect(await isEventOnlyDrop('demon_horn', character)).toBe(true);
  });

  it('flags a drop whose only source is an event resource node', async () => {
    withEventsFile([magicApparition]);
    const character = world({ nodes: [node('magic_tree', ['magic_wood'])] });

    expect(await isEventOnlyDrop('magic_wood', character)).toBe(true);
  });

  it('leaves a drop alone when a permanent monster also drops it', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      monsters: [
        monster('demon', ['piece_of_obsidian']),
        monster('cultist_acolyte', ['piece_of_obsidian']),
      ],
    });

    expect(await isEventOnlyDrop('piece_of_obsidian', character)).toBe(false);
  });

  it('leaves a drop alone when nothing at all drops it', async () => {
    withEventsFile([portalDemon]);
    const character = world({});

    expect(await isEventOnlyDrop('gold_bar', character)).toBe(false);
  });

  it('leaves a drop alone when the events file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);
    const character = world({ monsters: [monster('demon', ['demon_horn'])] });

    expect(await isEventOnlyDrop('demon_horn', character)).toBe(false);
  });
});

describe('eventBlockedIngredients', () => {
  it('reports an event-only ingredient the bank cannot cover', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      items: [
        item('gold_shield', [
          ['gold_bar', 7],
          ['demon_horn', 4],
        ]),
        item('demon_horn'),
        item('gold_bar'),
      ],
      monsters: [monster('demon', ['demon_horn'])],
      bank: { demon_horn: 2 },
    });

    expect(await eventBlockedIngredients('gold_shield', 1, character)).toEqual([
      'demon_horn',
    ]);
  });

  it('allows the craft when the bank and inventory cover the full amount', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      items: [item('gold_shield', [['demon_horn', 4]]), item('demon_horn')],
      monsters: [monster('demon', ['demon_horn'])],
      inventory: { demon_horn: 1 },
      bank: { demon_horn: 3 },
    });

    expect(await eventBlockedIngredients('gold_shield', 1, character)).toEqual(
      [],
    );
  });

  it('accounts for the quantity being crafted', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      items: [item('gold_shield', [['demon_horn', 4]]), item('demon_horn')],
      monsters: [monster('demon', ['demon_horn'])],
      bank: { demon_horn: 4 },
    });

    expect(await eventBlockedIngredients('gold_shield', 2, character)).toEqual([
      'demon_horn',
    ]);
  });

  it('finds an event-only ingredient nested inside a sub-craft', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      items: [
        item('demon_helm', [['demon_plate', 2]]),
        item('demon_plate', [['demon_horn', 3]]),
        item('demon_horn'),
      ],
      monsters: [monster('demon', ['demon_horn'])],
    });

    expect(await eventBlockedIngredients('demon_helm', 1, character)).toEqual([
      'demon_horn',
    ]);
  });

  it('stops at a sub-craft the bank already covers', async () => {
    withEventsFile([portalDemon]);
    const character = world({
      items: [
        item('demon_helm', [['demon_plate', 2]]),
        item('demon_plate', [['demon_horn', 3]]),
        item('demon_horn'),
      ],
      monsters: [monster('demon', ['demon_horn'])],
      bank: { demon_plate: 2 },
    });

    expect(await eventBlockedIngredients('demon_helm', 1, character)).toEqual(
      [],
    );
  });

  it('reports nothing for an item that cannot be crafted at all', async () => {
    withEventsFile([portalDemon]);
    const character = world({ items: [item('demon_horn')] });

    expect(await eventBlockedIngredients('demon_horn', 1, character)).toEqual(
      [],
    );
  });
});
