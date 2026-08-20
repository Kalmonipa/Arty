import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Tasks', () => ({
  actionCancelTask: jest.fn(),
  actionAcceptNewTask: jest.fn(),
}));

import { actionCancelTask } from '../../src/api_calls/Tasks.js';
import { Objective } from '../../src/core/Objective.js';
import { ApiError } from '../../src/core/Error.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { Character } from '../../src/character/character.js';
import { TaskCancelledResponseSchema } from '../../src/types/types.js';
import { MAX_TASK_REROLLS } from '../../src/constants.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

/**
 * Cancelling costs exactly one tasks coin (`POST /my/{name}/action/task/cancel`
 * — "Cancel a task for 1 tasks coin"). The batch withdrawal is only a
 * round-trip saving, so it must never make a cancel that one coin could pay for
 * look unaffordable.
 */
class CancellingObjective extends Objective {
  constructor(character: Character) {
    super(character, 'cancel_probe', 'not_started');
  }
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}

function makeCharacter(coinsInInv: number, coinsInBank: number) {
  const character = {
    data: { ...mockCharacterData },
    checkQuantityOfItemInInv: jest.fn(() => coinsInInv),
    checkQuantityOfItemInBank: jest.fn(async () => coinsInBank),
    withdrawNow: jest.fn(async (quantity: number) =>
      quantity <= coinsInBank ? ObjectiveCompleted : ObjectiveFailed,
    ),
    handleErrors: jest.fn(async () => true),
    findMaps: jest.fn(() => [{ x: 1, y: 2 }]),
    evaluateClosestMap: jest.fn(() => ({ x: 1, y: 2 })),
    move: jest.fn(async () => undefined),
  };
  return character as unknown as Character & typeof character;
}

const cancelSucceeds = () =>
  jest.mocked(actionCancelTask).mockResolvedValue({
    data: { character: { ...mockCharacterData } },
  } as TaskCancelledResponseSchema);

describe('cancelCurrentTask coin handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('withdraws only what the bank holds when it holds less than the batch', async () => {
    cancelSucceeds();
    const character = makeCharacter(0, 2);
    const objective = new CancellingObjective(character);

    const cancelled = await objective.cancelCurrentTask('items');

    expect(character.withdrawNow).toHaveBeenCalledWith(2, 'tasks_coin');
    expect(cancelled).toBe(true);
  });

  it('withdraws the full batch when the bank can cover it', async () => {
    cancelSucceeds();
    const character = makeCharacter(0, 10);
    const objective = new CancellingObjective(character);

    await objective.cancelCurrentTask('items');

    expect(character.withdrawNow).toHaveBeenCalledWith(
      MAX_TASK_REROLLS,
      'tasks_coin',
    );
  });

  it('skips the withdrawal when a coin is already carried', async () => {
    cancelSucceeds();
    const character = makeCharacter(1, 10);
    const objective = new CancellingObjective(character);

    const cancelled = await objective.cancelCurrentTask('items');

    expect(character.withdrawNow).not.toHaveBeenCalled();
    expect(cancelled).toBe(true);
  });

  it('reports failure without cancelling when no coins are reachable', async () => {
    cancelSucceeds();
    const character = makeCharacter(0, 0);
    const objective = new CancellingObjective(character);

    const cancelled = await objective.cancelCurrentTask('items');

    expect(cancelled).toBe(false);
    expect(actionCancelTask).not.toHaveBeenCalled();
  });

  it('reports failure when the cancel action itself errors', async () => {
    jest
      .mocked(actionCancelTask)
      .mockResolvedValue(
        new ApiError({ code: 486, message: 'Action already in progress' }),
      );
    const character = makeCharacter(1, 10);
    const objective = new CancellingObjective(character);

    const cancelled = await objective.cancelCurrentTask('items');

    expect(cancelled).toBe(false);
  });
});
