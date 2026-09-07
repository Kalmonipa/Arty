import { jest } from '@jest/globals';

jest.mock('../../src/api_calls/Actions', () => ({
  actionDepositItems: jest.fn(),
  actionMove: jest.fn(),
  actionRest: jest.fn(),
  actionTransition: jest.fn(),
}));

import { actionDepositItems } from '../../src/api_calls/Actions.js';
import { Character } from '../../src/character/character.js';
import { ApiError } from '../../src/core/Error.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const mockedDeposit = actionDepositItems as jest.MockedFunction<
  typeof actionDepositItems
>;

const bankFull = () =>
  new ApiError({ code: 462, message: 'Your bank is full.' });

/**
 * A deposit that never succeeds, with a valve that lets the call through once
 * the run is plainly a runaway. Without it the recursion this test covers spins
 * until the stack gives out and takes the suite with it.
 */
function alwaysFails(valveAfter = 25): void {
  let calls = 0;
  mockedDeposit.mockImplementation(async () => {
    calls += 1;
    if (calls > valveAfter) {
      return { data: { character: undefined } } as never;
    }
    return bankFull() as never;
  });
}

describe('depositing into a bank that rejects the deposit', () => {
  let character: Character;
  let handleErrors: jest.MockedFunction<() => Promise<boolean>>;

  beforeEach(() => {
    jest.clearAllMocks();

    character = new Character({
      ...mockCharacterData,
      // 118/118 slots used, so the deposit path runs
      inventory: [{ slot: 0, code: 'ash_wood', quantity: 118 }],
    });

    handleErrors = jest.fn<() => Promise<boolean>>(async () => false);
    character.handleErrors = handleErrors as never;
    character.getAvailableBanks = jest.fn(async () => []) as never;
    character.evaluateClosestMap = jest.fn(() => undefined) as never;
    character.move = jest.fn(async () => true) as never;
    character.topUpTeleportPotions = jest.fn(async () => undefined) as never;
  });

  it('stops when the error says the deposit cannot succeed', async () => {
    // The 429 storm of 06 Sep: a full bank answered 462, and the deposit went
    // straight back round without reading that verdict — 2.7 calls a second
    alwaysFails();

    await character.evaluateDepositItemsInBank();

    expect(mockedDeposit).toHaveBeenCalledTimes(1);
  });

  it('reports that nothing was deposited when it gives up', async () => {
    alwaysFails();

    expect(await character.evaluateDepositItemsInBank()).toBe(false);
  });

  it('retries a handful of times when the error is worth retrying', async () => {
    // 486 (action already in progress) is the retryable case: handleErrors
    // sleeps out the cooldown and says try again
    handleErrors.mockResolvedValue(true);
    alwaysFails();

    await character.evaluateDepositItemsInBank();

    expect(mockedDeposit.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mockedDeposit.mock.calls.length).toBeGreaterThan(1);
  });
});
