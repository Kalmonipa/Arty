import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Tasks', () => ({
  actionTasksTrade: jest.fn(),
  actionAcceptNewTask: jest.fn(),
  actionCancelTask: jest.fn(),
  actionCompleteTask: jest.fn(),
}));

import { getItemInformation } from '../../src/api_calls/Items.js';
import { ItemTaskObjective } from '../../src/core/ItemTaskObjective.js';
import { Character } from '../../src/character/character.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

/**
 * A task for an item the fleet wants to keep is cancelled instead of collected.
 * When that cancel cannot go through, retrying it changes nothing — the coins
 * are still short and the task is still the same one — so the retry budget must
 * not be spent re-attempting it. Spinning here is what drove a character to
 * ~150 identical cancel attempts an hour against the shared API budget.
 */
function makeCharacter() {
  const character = {
    data: {
      ...mockCharacterData,
      task: 'strange_ore',
      task_type: 'items',
      // Already collected, so the run reaches hand-in without entering the
      // gather loop — this case is only about what the failed cancel does.
      task_progress: 5,
      task_total: 5,
    },
    checkQuantityOfItemInInv: jest.fn(() => 0),
    checkQuantityOfItemInBank: jest.fn(async (code: string) =>
      code === 'tasks_coin' ? 2 : 0,
    ),
    withdrawNow: jest.fn(
      async (): Promise<ObjectiveResult> => ObjectiveCompleted,
    ),
    handleErrors: jest.fn(async () => true),
    findMaps: jest.fn(() => [{ x: 1, y: 2 }]),
    evaluateClosestMap: jest.fn(() => ({ x: 1, y: 2 })),
    move: jest.fn(async () => undefined),
    executeJobNow: jest.fn(
      async (): Promise<ObjectiveResult> => ObjectiveCompleted,
    ),
    gatherNow: jest.fn(
      async (): Promise<ObjectiveResult> => ObjectiveCompleted,
    ),
    addItemToItemsToKeep: jest.fn(),
    removeItemFromItemsToKeep: jest.fn(),
    saveJobQueue: jest.fn(async () => undefined),
    checkQuantityOfItemInInvByCode: jest.fn(() => 0),
    completeTask: jest.fn(async () => true),
  };
  return character as unknown as Character & typeof character;
}

describe('item task whose cancel cannot go through', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getItemInformation).mockResolvedValue({
      code: 'strange_ore',
      name: 'Strange Ore',
      level: 40,
      type: 'resource',
      subtype: 'mining',
      description: '',
      craft: undefined,
      tradeable: true,
      conditions: [],
      effects: [],
    } as never);
  });

  it('does not spend the retry budget re-attempting the same cancel', async () => {
    const character = makeCharacter();
    const objective = new ItemTaskObjective(character, 1);
    const cancel = jest
      .spyOn(objective, 'cancelCurrentTask')
      .mockResolvedValue(false);
    jest.spyOn(objective, 'checkStatus').mockResolvedValue(true);

    await objective.doTask();

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('gets on with the task instead of failing out', async () => {
    const character = makeCharacter();
    const objective = new ItemTaskObjective(character, 1);
    jest.spyOn(objective, 'cancelCurrentTask').mockResolvedValue(false);
    jest.spyOn(objective, 'checkStatus').mockResolvedValue(true);
    const handIn = jest
      .spyOn(objective, 'handInTask')
      .mockResolvedValue(ObjectiveCompleted);

    const result = await objective.doTask();

    expect(handIn).toHaveBeenCalledWith('items');
    expect(result.success).toBe(true);
  });
});
