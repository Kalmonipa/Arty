import { getHighestWeaponcraftingLevel } from '../../src/utils.js';
import { CharacterSchema } from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';

const charWith = (
  name: string,
  weaponcrafting_level: number,
): CharacterSchema => ({
  ...mockCharacterData,
  name,
  weaponcrafting_level,
});

describe('getHighestWeaponcraftingLevel', () => {
  it('returns the highest weaponcrafting level across the village', () => {
    const village = [
      charWith('ZippyZoe', 1),
      charWith('LongLegLarry', 24),
      charWith('TimidTom', 1),
    ];

    expect(getHighestWeaponcraftingLevel(village)).toBe(24);
  });

  it('finds the crafter wherever they sit in the list', () => {
    const village = [charWith('LongLegLarry', 24), charWith('ZippyZoe', 1)];

    expect(getHighestWeaponcraftingLevel(village)).toBe(24);
  });

  it('returns the only level when the village has one character', () => {
    expect(getHighestWeaponcraftingLevel([charWith('ZippyZoe', 1)])).toBe(1);
  });
});
