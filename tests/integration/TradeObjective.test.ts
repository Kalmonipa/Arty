import { jest } from '@jest/globals';
import { TradeObjective } from '../../src/core/TradeWithNPCObjective.js';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import { getAllNpcItems, actionBuyItem } from '../../src/api_calls/NPC.js';

jest.mock('../../src/api_calls/NPC', () => ({
  getAllNpcItems: jest.fn(),
  actionBuyItem: jest.fn(),
  actionSellItem: jest.fn(),
}));

const mockedGetAllNpcItems = getAllNpcItems as jest.MockedFunction<
  typeof getAllNpcItems
>;
const mockedActionBuyItem = actionBuyItem as jest.MockedFunction<
  typeof actionBuyItem
>;

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
    const gatherJob = character.executeJobNow.mock.calls[0][0] as GatherObjective;
    expect(gatherJob).toBeInstanceOf(GatherObjective);
    // Must ask for the full 3 wool. GatherObjective counts the 2 already held
    // (which will be spent) toward its target, so asking for the deficit of 1
    // makes it no-op and the trade fails with 478.
    expect(gatherJob.target.quantity).toBe(3);
  });
});
