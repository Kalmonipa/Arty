import path from 'node:path';
import * as fs from 'node:fs/promises';
import { buildListOf } from '../../src/utils.js';
import { ItemSchema } from '../../src/types/types.js';

const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const bronzeArmor = {
  code: 'copper_armor',
  type: 'body_armor',
  effects: [{ code: 'hp', value: 40 }],
} as unknown as ItemSchema;

const woodenStaff = {
  code: 'wooden_staff',
  type: 'weapon',
  effects: [{ code: 'attack_air', value: 8 }],
} as unknown as ItemSchema;

describe('buildListOf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(
      JSON.stringify([bronzeArmor, woodenStaff]) as never,
    );
  });

  it('reads the items file written by the pull-gamestate script', async () => {
    await buildListOf('body_armor');

    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(process.cwd(), 'data', 'items-data.json'),
      'utf-8',
    );
  });

  it('maps only items of the requested type, keyed by effect', async () => {
    const result = await buildListOf('body_armor');

    expect(result).toEqual({ hp: [bronzeArmor] });
  });
});
