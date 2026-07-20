import { jest } from '@jest/globals';
import { Character } from '../../src/character/characterClass.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { OnHoldJob } from '../../src/types/ObjectiveData.js';

const onHoldEntry = (objectiveId: string): OnHoldJob =>
  ({
    job: { objectiveId },
    waitingOn: [],
    parkedAt: '2026-07-20T00:00:00.000Z',
    retried: false,
  }) as unknown as OnHoldJob;

describe('Character.dropOnHoldJobById', () => {
  let character: Character;

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
  });

  it('drops the matching on-hold entry and returns true', async () => {
    const target = onHoldEntry('train_21_weaponcrafting_6894');
    const other = onHoldEntry('train_21_weaponcrafting_dee9');
    character.onHold = [target, other];

    const result = await character.dropOnHoldJobById(
      'train_21_weaponcrafting_6894',
    );

    expect(result).toBe(true);
    expect(character.onHold).toEqual([other]);
    expect(character.saveJobQueue).toHaveBeenCalled();
  });

  it('returns false and leaves onHold untouched when the id is absent', async () => {
    const only = onHoldEntry('train_21_weaponcrafting_6894');
    character.onHold = [only];

    const result = await character.dropOnHoldJobById('nonexistent_id');

    expect(result).toBe(false);
    expect(character.onHold).toEqual([only]);
    expect(character.saveJobQueue).not.toHaveBeenCalled();
  });
});
