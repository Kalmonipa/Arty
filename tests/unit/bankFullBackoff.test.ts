import { jest } from '@jest/globals';
import { Character } from '../../src/character/CharacterClass.js';
import { ApiError } from '../../src/core/Error.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const bankFull = () =>
  new ApiError({ code: 462, message: 'Your bank is full.' });

describe('handling a full bank (462)', () => {
  let character: Character;
  let executeJobNow: jest.MockedFunction<() => Promise<ObjectiveResult>>;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new Character({ ...mockCharacterData });
    executeJobNow = jest.fn<() => Promise<ObjectiveResult>>(
      async () => ObjectiveFailed,
    );
    character.executeJobNow = executeJobNow as never;
  });

  it('tries to expand the bank the first time', async () => {
    await character.handleErrors(bankFull());

    expect(executeJobNow).toHaveBeenCalledTimes(1);
  });

  it('does not launch a fresh expansion for every failed deposit', async () => {
    // The loop that exhausted the fleet's API budget: one expand job, and one
    // bank listing, per 462 — roughly one and a half every second
    for (let attempt = 0; attempt < 20; attempt++) {
      await character.handleErrors(bankFull());
    }

    expect(executeJobNow).toHaveBeenCalledTimes(1);
  });

  it('tells the caller to stop retrying while it is backing off', async () => {
    await character.handleErrors(bankFull());

    // A deposit into a bank that is still full cannot succeed, so retrying it
    // only burns the action budget
    expect(await character.handleErrors(bankFull())).toBe(false);
  });

  it('reports success when the expansion actually worked', async () => {
    executeJobNow.mockResolvedValue(ObjectiveCompleted);

    expect(await character.handleErrors(bankFull())).toBe(true);
  });

  it('tries again once the backoff has elapsed', async () => {
    jest.useFakeTimers();
    try {
      await character.handleErrors(bankFull());
      await character.handleErrors(bankFull());
      expect(executeJobNow).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(10 * 60 * 1000);
      await character.handleErrors(bankFull());

      expect(executeJobNow).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('backs off per character rather than globally', async () => {
    const other = new Character({ ...mockCharacterData, name: 'ZippyZoe' });
    const otherExecute = jest.fn<() => Promise<ObjectiveResult>>(
      async () => ObjectiveFailed,
    );
    other.executeJobNow = otherExecute as never;

    await character.handleErrors(bankFull());
    await other.handleErrors(bankFull());

    expect(otherExecute).toHaveBeenCalledTimes(1);
  });
});
