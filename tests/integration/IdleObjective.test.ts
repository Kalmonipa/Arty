import { jest } from '@jest/globals';
import { IdleObjective } from '../../src/core/IdleObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ItemSchema, CharacterSchema } from '../../src/types/types.js';
import { GearEffects } from '../../src/types/ItemData.js';
import { ApiError } from '../../src/core/Error.js';

jest.mock('../../src/api_calls/NPC', () => ({
  getAllNpcItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Items', () => ({
  actionClaimPendingItems: jest.fn(),
  getAllItemInformation: jest.fn(),
  getPendingItems: jest.fn(),
}));

jest.mock('../../src/api_calls/Monsters', () => ({
  getAllMonsterInformation: jest.fn(),
}));

import { getAllNpcItems } from '../../src/api_calls/NPC.js';

const createMockArtifact = (
  code: string,
  level: number,
  effectType: GearEffects,
): ItemSchema => ({
  code,
  name: code,
  level,
  type: 'artifact',
  subtype: 'artifact',
  description: '',
  craft: null,
  tradeable: true,
  conditions: [],
  effects: [
    { code: effectType, value: 20, description: `${effectType} effect` },
  ],
});

const makeRestorePotion = (code: string, level: number): ItemSchema => ({
  code,
  name: code,
  level,
  type: 'utility',
  subtype: 'potion',
  description: '',
  craft: { skill: 'alchemy', level, items: [], quantity: 1 } as any,
  tradeable: true,
  conditions: [],
  effects: [{ code: 'restore', value: 100, description: 'restore' }],
});

const makeNpcResult = (
  items: Array<{ buy_price?: number | null; currency?: string; code?: string }>,
) => ({
  data: items.map((item, i) => ({
    code: item.code ?? 'artifact',
    npc: `npc_${i}`,
    currency: item.currency ?? 'gold',
    buy_price: item.buy_price ?? null,
    sell_price: null,
  })),
  total: 50,
  page: 1,
  pages: 1,
  size: 1,
});

class MockCharacter {
  data: CharacterSchema = { ...mockCharacterData };

  artifactsMap: Record<GearEffects, ItemSchema[]> | undefined = undefined;

  jobList: unknown[] = [];

  getCharacterLevel = jest.fn((char: CharacterSchema): number => char.level);

  getCharacterGearIn = jest.fn((_slot: string): string => '');

  checkQuantityOfItemInInv = jest.fn((_code: string): number => 0);

  checkQuantityOfItemInBank = jest.fn(
    async (_code: string): Promise<number> => 0,
  );

  executeJobNow = jest.fn(async (): Promise<boolean> => true);

  depositNow = jest.fn(async (): Promise<boolean> => true);

  craftNow = jest.fn(
    async (_quantity: number, _code: string): Promise<boolean> => true,
  );

  handleErrors = jest.fn(async (): Promise<boolean> => true);

  saveJobQueue = jest.fn(async (): Promise<void> => {});

  utilitiesMap: Record<string, ItemSchema[]> = { restore: [], antipoison: [] };

  allCharacterDetails: CharacterSchema[] = [];

  highestCharLevel = 30;

  lowestCharLevel = 1;
}

describe('IdleObjective.checkAndBuyArtifacts', () => {
  let mockCharacter: MockCharacter;
  let objective: IdleObjective;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCharacter = new MockCharacter();
    mockCharacter.data = { ...mockCharacterData }; // level: 10
    objective = new IdleObjective(mockCharacter as any, 'miner');
  });

  it('returns early without buying when artifactsMap is not built', async () => {
    mockCharacter.artifactsMap = undefined;

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
    expect(mockCharacter.depositNow).not.toHaveBeenCalled();
  });

  it('skips artifact already equipped in an artifact slot', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    mockCharacter.getCharacterGearIn.mockImplementation((slot: string) =>
      slot === 'artifact1' ? 'hp_stone' : '',
    );

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips artifact already in inventory', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'hp_stone' ? 1 : 0,
    );

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips artifact already in bank', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'hp_stone' ? 1 : 0),
    );

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips when getAllNpcItems returns an ApiError', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(new ApiError({ code: 404, message: 'Not found' }));

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips when no NPC carries the artifact (empty result)', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([]));

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips when all NPC entries have null buy_price', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: null }]));

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('skips when character cannot afford the artifact', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: 1000, currency: 'gold' }]));
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 300 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'gold' ? 600 : 0),
    );

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('buys and deposits artifact when affordable and not owned', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: 100, currency: 'gold' }]));
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 200 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(async () => 0);

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).toHaveBeenCalledTimes(1);
    expect(mockCharacter.depositNow).toHaveBeenCalledWith(1, 'hp_stone');
  });

  it('skips effect when no artifact is at or below character level', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 20, 'hp')], // level 20 > char level 10
    } as any;

    await (objective as any).checkAndBuyArtifacts();

    expect(getAllNpcItems).not.toHaveBeenCalled();
    expect(mockCharacter.executeJobNow).not.toHaveBeenCalled();
  });

  it('uses lowest buy_price when multiple NPCs sell the same artifact', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(
      makeNpcResult([
        { buy_price: 500, currency: 'gold' },
        { buy_price: 50, currency: 'gold' },
      ]),
    );
    // Can afford 50 but not 500
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 100 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(async () => 0);

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).toHaveBeenCalledTimes(1);
    expect(mockCharacter.depositNow).toHaveBeenCalledWith(1, 'hp_stone');
  });

  it('selects the highest-level artifact at or below character level', async () => {
    mockCharacter.artifactsMap = {
      hp: [
        createMockArtifact('hp_stone_5', 5, 'hp'),
        createMockArtifact('hp_stone_8', 8, 'hp'),
        createMockArtifact('hp_stone_15', 15, 'hp'), // above char level 10
      ],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: 100, currency: 'gold' }]));
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 500 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(async () => 0);

    await (objective as any).checkAndBuyArtifacts();

    expect(getAllNpcItems).toHaveBeenCalledWith({ code: 'hp_stone_8' });
    expect(mockCharacter.depositNow).toHaveBeenCalledWith(1, 'hp_stone_8');
  });

  it('continues to next effect when TradeObjective fails', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
      wisdom: [createMockArtifact('wisdom_gem', 5, 'wisdom')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: 100, currency: 'gold' }]));
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 500 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(async () => 0);
    mockCharacter.executeJobNow
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await (objective as any).checkAndBuyArtifacts();

    expect(mockCharacter.executeJobNow).toHaveBeenCalledTimes(2);
    // Only deposits for the successful buy
    expect(mockCharacter.depositNow).toHaveBeenCalledTimes(1);
  });

  it('continues to next effect when depositNow fails', async () => {
    mockCharacter.artifactsMap = {
      hp: [createMockArtifact('hp_stone', 5, 'hp')],
      wisdom: [createMockArtifact('wisdom_gem', 5, 'wisdom')],
    } as any;
    (
      getAllNpcItems as jest.MockedFunction<typeof getAllNpcItems>
    ).mockResolvedValue(makeNpcResult([{ buy_price: 100, currency: 'gold' }]));
    mockCharacter.checkQuantityOfItemInInv.mockImplementation((code: string) =>
      code === 'gold' ? 500 : 0,
    );
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(async () => 0);
    mockCharacter.depositNow
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await (objective as any).checkAndBuyArtifacts();

    // Attempted deposit for both effects
    expect(mockCharacter.depositNow).toHaveBeenCalledTimes(2);
  });
});

describe('IdleObjective.topUpBank (alchemist restore potions)', () => {
  let mockCharacter: MockCharacter;
  let objective: IdleObjective;

  const rosterLevels = (levels: number[]): CharacterSchema[] =>
    levels.map((level) => ({ level }) as CharacterSchema);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCharacter = new MockCharacter();
    mockCharacter.data = { ...mockCharacterData };
    mockCharacter.utilitiesMap = {
      restore: [
        makeRestorePotion('small_health_potion', 5),
        makeRestorePotion('minor_health_potion', 20),
        makeRestorePotion('health_potion', 30),
      ],
      antipoison: [],
    };
    // Alchemist skill is high enough to craft every tier
    mockCharacter.getCharacterLevel.mockReturnValue(45);
    objective = new IdleObjective(mockCharacter as any, 'alchemist');
  });

  it('crafts the best usable tier for each character, covering low and high levels', async () => {
    // 2 characters below 20 -> small is their best; 3 above 20 -> minor is theirs
    mockCharacter.allCharacterDetails = rosterLevels([12, 18, 22, 25, 28]);

    await (objective as any).topUpBank();

    const craftedCodes = mockCharacter.craftNow.mock.calls.map(
      (call) => call[1],
    );
    expect(craftedCodes).toContain('small_health_potion');
    expect(craftedCodes).toContain('minor_health_potion');
    // No character can use health_potion (level 30); highest is 28
    expect(craftedCodes).not.toContain('health_potion');
  });

  it('does not craft low tiers when no character is stuck at that tier', async () => {
    // Every character is high level -> small potions are wasteful, nobody needs them
    mockCharacter.allCharacterDetails = rosterLevels([35, 40, 42]);

    await (objective as any).topUpBank();

    const craftedCodes = mockCharacter.craftNow.mock.calls.map(
      (call) => call[1],
    );
    expect(craftedCodes).not.toContain('small_health_potion');
    expect(craftedCodes).not.toContain('minor_health_potion');
    expect(craftedCodes).toContain('health_potion');
  });

  it('skips a tier already stocked in the bank', async () => {
    mockCharacter.allCharacterDetails = rosterLevels([12, 25]);
    mockCharacter.checkQuantityOfItemInBank.mockImplementation(
      async (code: string) => (code === 'small_health_potion' ? 500 : 0),
    );

    await (objective as any).topUpBank();

    const craftedCodes = mockCharacter.craftNow.mock.calls.map(
      (call) => call[1],
    );
    expect(craftedCodes).not.toContain('small_health_potion');
    expect(craftedCodes).toContain('minor_health_potion');
  });
});
