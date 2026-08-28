import * as fs from 'node:fs/promises';
import { getCraftableItems } from '../../src/utils.js';
import { ItemSchema } from '../../src/types/types.js';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const gear = (
  code: string,
  level: number,
  skill: string,
  type = 'helmet',
): ItemSchema =>
  ({
    code,
    name: code,
    level,
    type,
    craft: { skill, level, items: [], quantity: 1 },
  }) as unknown as ItemSchema;

const catalogue = [
  gear('copper_helmet', 1, 'gearcrafting'),
  gear('gold_helm', 30, 'gearcrafting'),
  gear('gold_platebody', 30, 'gearcrafting', 'body_armor'),
  gear('strangold_helmet', 35, 'gearcrafting'),
  gear('dreadful_helmet', 40, 'gearcrafting'),
  gear('gold_sword', 30, 'weaponcrafting', 'weapon'),
  { code: 'gold_bar', name: 'gold_bar', level: 30, type: 'resource' },
];

describe('getCraftableItems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(JSON.stringify(catalogue) as never);
  });

  it('reads the items file written by the pull-gamestate script', async () => {
    await getCraftableItems('gearcrafting', 37);

    expect(mockReadFile).toHaveBeenCalled();
  });

  it('returns every tier the skill makes up to the level, not just the first fifty', async () => {
    const items = await getCraftableItems('gearcrafting', 37);

    expect(items?.map((item) => item.code)).toEqual([
      'copper_helmet',
      'gold_helm',
      'gold_platebody',
      'strangold_helmet',
    ]);
  });

  it('leaves out tiers above the level given', async () => {
    const items = await getCraftableItems('gearcrafting', 30);

    expect(items?.map((item) => item.code)).not.toContain('strangold_helmet');
  });

  it('leaves out other skills and things that are not crafted', async () => {
    const items = await getCraftableItems('gearcrafting', 40);

    expect(items?.map((item) => item.code)).not.toContain('gold_sword');
    expect(items?.map((item) => item.code)).not.toContain('gold_bar');
  });

  it('says nothing rather than empty when the catalogue cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT') as never);

    const items = await getCraftableItems('gearcrafting', 37);

    expect(items).toBeUndefined();
  });

  it('returns an empty list when the skill makes nothing at that level', async () => {
    const items = await getCraftableItems('gearcrafting', 0);

    expect(items).toEqual([]);
  });
});
