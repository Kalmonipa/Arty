import { jest } from '@jest/globals';

import * as fs from 'node:fs/promises';
import { clearEventContentCache } from '../../src/events/events.cache.js';
import { selectMobsForDrop } from '../../src/core/monsterSelection.js';
import { Character } from '../../src/character/character.js';
import {
  EventSchema,
  MapSchema,
  MonsterSchema,
} from '../../src/types/types.js';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const drop = (code: string, rate: number, maxQuantity = 1) => ({
  code,
  rate,
  min_quantity: 1,
  max_quantity: maxQuantity,
});

const monster = (
  code: string,
  overrides: Partial<MonsterSchema> = {},
): MonsterSchema =>
  ({
    code,
    name: code,
    level: 30,
    type: 'normal',
    drops: [drop('owlbear_claw', 12, 2)],
    ...overrides,
  }) as MonsterSchema;

const monsterEvent = (code: string): EventSchema =>
  ({
    code,
    name: code,
    content: { type: 'monster', code },
  }) as EventSchema;

/** A character whose only knowledge is which mobs have a permanent map */
const characterWithMaps = (mappedMobs: string[]) =>
  ({
    findMaps: ({ content_code }: { content_code?: string }): MapSchema[] =>
      content_code && mappedMobs.includes(content_code)
        ? ([{ x: 0, y: 0 }] as MapSchema[])
        : [],
  }) as unknown as Character;

describe('selectMobsForDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEventContentCache();
    mockReadFile.mockResolvedValue(
      JSON.stringify([monsterEvent('corrupted_owlbear')]),
    );
  });

  it('leaves out the event-only dropper and keeps the permanent one', async () => {
    const droppers = await selectMobsForDrop(
      [monster('corrupted_owlbear'), monster('owlbear')],
      characterWithMaps(['owlbear']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual(['owlbear']);
  });

  it('leaves out bosses', async () => {
    const droppers = await selectMobsForDrop(
      [monster('bandit_lizard', { type: 'boss' }), monster('owlbear')],
      characterWithMaps(['bandit_lizard', 'owlbear']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual(['owlbear']);
  });

  it('leaves out mobs with no permanent map even when no event names them', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify([]));

    const droppers = await selectMobsForDrop(
      [monster('rosenblood'), monster('owlbear')],
      characterWithMaps(['owlbear']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual(['owlbear']);
  });

  it('orders droppers by fights needed per unit, counting the yield per kill', async () => {
    const droppers = await selectMobsForDrop(
      [
        monster('slow', { drops: [drop('owlbear_claw', 30)] }),
        // A worse rate, but two claws a kill makes it the faster farm
        monster('generous', { drops: [drop('owlbear_claw', 20, 3)] }),
        monster('quick', { drops: [drop('owlbear_claw', 8)] }),
      ],
      characterWithMaps(['slow', 'generous', 'quick']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual([
      'quick',
      'generous',
      'slow',
    ]);
  });

  it('breaks a tie on drop rate by taking the lower level mob', async () => {
    const droppers = await selectMobsForDrop(
      [monster('tougher', { level: 30 }), monster('easier', { level: 20 })],
      characterWithMaps(['tougher', 'easier']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual(['easier', 'tougher']);
  });

  it('ignores mobs that do not drop the item at all', async () => {
    const droppers = await selectMobsForDrop(
      [monster('chicken', { drops: [drop('feather', 6)] }), monster('owlbear')],
      characterWithMaps(['chicken', 'owlbear']),
      'owlbear_claw',
    );

    expect(droppers.map((mob) => mob.code)).toEqual(['owlbear']);
  });

  it('returns nothing when every dropper is unreachable', async () => {
    const droppers = await selectMobsForDrop(
      [monster('corrupted_owlbear')],
      characterWithMaps(['corrupted_owlbear']),
      'owlbear_claw',
    );

    expect(droppers).toEqual([]);
  });
});
