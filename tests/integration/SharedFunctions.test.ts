import { jest } from '@jest/globals';
import { checkWithinLevelRange } from '../../src/idleObjectives/SharedFunctions.js';
import { GetCharacterData } from '../../src/utils.js';
import { CharacterSchema } from '../../src/types/types.js';

jest.mock('../../src/utils.js', () => {
  const actual =
    jest.requireActual<typeof import('../../src/utils.js')>(
      '../../src/utils.js',
    );
  return {
    ...actual,
    GetCharacterData: jest.fn(),
    logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  };
});

const mockedGetCharacterData = GetCharacterData as jest.MockedFunction<
  typeof GetCharacterData
>;

class MockCharacter {
  data = { level: 30 };
  highestCharLevel = 0;
  trainCombatLevelNow = jest.fn(async () => true);
}

describe('checkWithinLevelRange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets highestCharLevel from all characters and returns true when in range', async () => {
    mockedGetCharacterData.mockResolvedValue([
      { level: 30 },
      { level: 35 },
    ] as CharacterSchema[]);

    const character = new MockCharacter();

    const result = await checkWithinLevelRange(character as any);

    expect(result).toBe(true);
    expect(character.highestCharLevel).toBe(35);
    expect(character.trainCombatLevelNow).not.toHaveBeenCalled();
  });

  it('trains when the character is more than 10 levels behind the leader', async () => {
    mockedGetCharacterData.mockResolvedValue([
      { level: 20 },
      { level: 40 },
    ] as CharacterSchema[]);

    const character = new MockCharacter();
    character.data.level = 20;

    await checkWithinLevelRange(character as any);

    expect(character.highestCharLevel).toBe(40);
    expect(character.trainCombatLevelNow).toHaveBeenCalledWith(30);
  });
});
