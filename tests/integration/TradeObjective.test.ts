import { jest } from '@jest/globals';
import { TradeObjective } from '../../src/core/TradeWithNPCObjective.js';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import { getAllNpcItems, actionBuyItem } from '../../src/api_calls/NPC.js';
import { getAllMaps } from '../../src/api_calls/Maps.js';

jest.mock('../../src/api_calls/NPC', () => ({
  getAllNpcItems: jest.fn(),
  actionBuyItem: jest.fn(),
  actionSellItem: jest.fn(),
}));

jest.mock('../../src/api_calls/Maps', () => ({
  getAllMaps: jest.fn(),
}));

const mockedGetAllNpcItems = getAllNpcItems as jest.MockedFunction<
  typeof getAllNpcItems
>;
const mockedActionBuyItem = actionBuyItem as jest.MockedFunction<
  typeof actionBuyItem
>;
const mockedGetAllMaps = getAllMaps as jest.MockedFunction<typeof getAllMaps>;

// Minimal character exposing only what TradeObjective.buyFromNpc touches.
class MockCharacter {
  data: any = { name: 'BouncyBella', gold: 0, x: 0, y: 0, inventory: [] };
  jobList: any[] = [];
  checkQuantityOfItemInInv = jest.fn((code: string) =>
    code === 'wool' ? 2 : 0,
  );
  checkQuantityOfItemInBank = jest.fn(async () => 0);
  withdrawNow = jest.fn(async () => true);
  executeJobNow = jest.fn(async (_job: any, ..._rest: any[]) => true);
  findMaps = jest.fn(() => [{ x: 1, y: 1 }] as any);
  evaluateClosestMap = jest.fn((maps: any[]) => ({
    x: maps[0].x,
    y: maps[0].y,
  }));
  move = jest.fn(async () => {});
  handleErrors = jest.fn(async () => true);
}

describe('TradeObjective buy currency gathering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: NPC is present on a cached-style map so findNpc succeeds
    mockedGetAllMaps.mockResolvedValue([
      { x: 1, y: 1, interactions: { content: { type: 'npc', code: 'tailor' } } },
    ] as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('gathers the full currency total, not just the deficit, when some is already held', async () => {
    // Tailor sells cloth for 3 wool each; buying 1 cloth needs 3 wool.
    mockedGetAllNpcItems.mockResolvedValue({
      data: [{ npc: 'tailor', currency: 'wool', buy_price: 3, code: 'cloth' }],
    } as any);
    mockedActionBuyItem.mockResolvedValue({ data: { character: {} } } as any);

    const character = new MockCharacter(); // holds 2 wool
    const objective = new TradeObjective(character as any, 'buy', 1, 'cloth');

    await objective.run();

    expect(character.executeJobNow).toHaveBeenCalledTimes(1);
    const gatherJob = character.executeJobNow.mock
      .calls[0][0] as GatherObjective;
    expect(gatherJob).toBeInstanceOf(GatherObjective);
    // Must ask for the full 3 wool. GatherObjective counts the 2 already held
    // (which will be spent) toward its target, so asking for the deficit of 1
    // makes it no-op and the trade fails with 478.
    expect(gatherJob.target.quantity).toBe(3);
  });

  it('locates an event NPC via the live maps API even when the cache is stale', async () => {
    // nomadic_merchant is an event trader absent from the cached map snapshot
    mockedGetAllNpcItems.mockResolvedValue({
      data: [
        {
          npc: 'nomadic_merchant',
          currency: 'gold',
          buy_price: 100,
          code: 'lost_world_map',
        },
      ],
    } as any);
    mockedActionBuyItem.mockResolvedValue({ data: { character: {} } } as any);
    mockedGetAllMaps.mockResolvedValue([
      {
        x: 5,
        y: 7,
        interactions: { content: { type: 'npc', code: 'nomadic_merchant' } },
      },
    ] as any);

    const character = new MockCharacter();
    character.data.gold = 1000;
    // Cached map lookup is stale and would return nothing for the event NPC
    character.findMaps = jest.fn(() => []);
    const objective = new TradeObjective(
      character as any,
      'buy',
      1,
      'lost_world_map',
    );

    const result = await objective.run();

    expect(result).toBe(true);
    expect(mockedGetAllMaps).toHaveBeenCalledWith({
      content_code: 'nomadic_merchant',
      content_type: 'npc',
    });
    expect(character.findMaps).not.toHaveBeenCalled();
    expect(character.move).toHaveBeenCalledWith({ x: 5, y: 7 });
    expect(mockedActionBuyItem).toHaveBeenCalled();
  });

  it('does not attempt to buy when the NPC map cannot be found', async () => {
    mockedGetAllNpcItems.mockResolvedValue({
      data: [
        {
          npc: 'nomadic_merchant',
          currency: 'gold',
          buy_price: 100,
          code: 'lost_world_map',
        },
      ],
    } as any);
    mockedActionBuyItem.mockResolvedValue({ data: { character: {} } } as any);
    mockedGetAllMaps.mockResolvedValue([]);

    const character = new MockCharacter();
    character.data.gold = 1000;
    const objective = new TradeObjective(
      character as any,
      'buy',
      1,
      'lost_world_map',
    );

    const result = await objective.run();

    expect(result).toBe(false);
    expect(character.move).not.toHaveBeenCalled();
    expect(mockedActionBuyItem).not.toHaveBeenCalled();
  });
});
