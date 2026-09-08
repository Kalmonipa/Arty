import { jest } from '@jest/globals';

const actionTasksExchange = jest.fn<() => Promise<unknown>>();

jest.mock('../../src/api_calls/Tasks.js', () => ({
  actionTasksExchange,
  actionAcceptNewTask: jest.fn(),
  actionCancelTask: jest.fn(),
  actionCompleteTask: jest.fn(),
  actionTasksTrade: jest.fn(),
}));

jest.mock('../../src/api_calls/Items.js', () => ({
  getAllItemInformation: jest.fn(async () => ({ data: [] })),
  getItemInformation: jest.fn(),
  actionClaimPendingItems: jest.fn(),
  getPendingItems: jest.fn(async () => ({ data: [] })),
}));

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
}));

import { Character } from '../../src/character/character.js';
import { IdleCrafterObjective } from '../../src/idleObjectives/idleCrafter.js';
import { MinTaskCoinsInBank } from '../../src/constants.js';
import { TasksCoin } from '../../src/gameDataConstants.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ObjectiveCompleted } from '../../src/types/ObjectiveData.js';
import { MapSchema } from '../../src/types/types.js';

const taskMasterMap = {
  name: 'Tasks Master',
  x: 1,
  y: 2,
  map_id: 42,
} as unknown as MapSchema;

describe('gambleExcessTaskCoins', () => {
  let character: Character;
  let gamble: () => Promise<boolean>;
  let bankCoins: number;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });

    // Bank reads hit the live API unless stubbed
    character.checkQuantityOfItemInBank = jest.fn(async () => bankCoins);
    character.withdrawNow = jest.fn(async () => ObjectiveCompleted);
    character.getAvailableTaskMasters = jest.fn(async () => [taskMasterMap]);
    character.evaluateClosestMap = jest.fn(() => taskMasterMap);
    character.move = jest.fn(async () => true);
    actionTasksExchange.mockResolvedValue({ data: {} });

    const objective = new IdleCrafterObjective(character, 'crafter');
    gamble = (
      objective as unknown as {
        gambleExcessTaskCoins: () => Promise<boolean>;
      }
    ).gambleExcessTaskCoins.bind(objective);
  });

  it('does not gamble while the bank is only holding the reserve', async () => {
    bankCoins = MinTaskCoinsInBank;

    expect(await gamble()).toBe(true);
    expect(actionTasksExchange).not.toHaveBeenCalled();
    expect(character.withdrawNow).not.toHaveBeenCalled();
  });

  it('does not gamble one coin short of an affordable exchange', async () => {
    bankCoins = MinTaskCoinsInBank + 5;

    expect(await gamble()).toBe(true);
    expect(actionTasksExchange).not.toHaveBeenCalled();
  });

  it('gambles once as soon as the reserve is covered plus an exchange', async () => {
    bankCoins = MinTaskCoinsInBank + 6;

    expect(await gamble()).toBe(true);
    expect(character.withdrawNow).toHaveBeenCalledWith(6, TasksCoin);
    expect(actionTasksExchange).toHaveBeenCalledTimes(1);
  });

  it('spends only the excess, leaving the reserve for rerolls', async () => {
    bankCoins = MinTaskCoinsInBank + 20;

    expect(await gamble()).toBe(true);
    // 20 spare buys 3 exchanges; the 2 coin remainder stays banked
    expect(character.withdrawNow).toHaveBeenCalledWith(18, TasksCoin);
    expect(actionTasksExchange).toHaveBeenCalledTimes(3);
  });

  it('gambles at a balance the old 100 coin threshold would have refused', async () => {
    bankCoins = 60;

    expect(await gamble()).toBe(true);
    expect(actionTasksExchange).toHaveBeenCalledTimes(1);
  });

  it('moves to the nearest task master before exchanging', async () => {
    bankCoins = MinTaskCoinsInBank + 6;

    await gamble();

    expect(character.move).toHaveBeenCalledWith(taskMasterMap);
  });
});
