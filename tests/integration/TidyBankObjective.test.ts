import { jest } from '@jest/globals';
import { TidyBankObjective } from '../../src/core/TidyBankObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ApiError } from '../../src/core/Error.js';
import { CraftSkill, ItemSchema } from '../../src/types/types.js';

jest.mock('../../src/api_calls/Items', () => ({
  getAllItemInformation: jest.fn(),
  getItemInformation: jest.fn(),
}));

jest.mock('../../src/api_calls/Bank', () => ({
  getBankItems: jest.fn(),
}));

import { getAllItemInformation } from '../../src/api_calls/Items.js';

const mockGetAllItemInformation = getAllItemInformation as jest.MockedFunction<
  typeof getAllItemInformation
>;

const makeGear = (code: string, level: number): ItemSchema => ({
  code,
  name: code,
  level,
  type: 'equipment',
  subtype: 'armor',
  description: '',
  tradeable: true,
  craft: { skill: 'gearcrafting' as CraftSkill, level, items: [], quantity: 1 },
});

const makeItemListResponse = (items: ItemSchema[]) => ({
  data: items,
  total: items.length,
  page: 1,
  size: 50,
});

class SimpleMockCharacter {
  data = { ...mockCharacterData };
  lowestCharLevel = 19;

  bankItems: Record<string, number> = {};

  getAllBankItems = jest.fn(async () =>
    Object.entries(this.bankItems).map(([code, quantity]) => ({ code, quantity })),
  );

  recycleItemNow = jest.fn(async (_code: string, _qty: number): Promise<boolean> => true);

  getCharacterLevel = jest.fn((_data: unknown, _skill?: string): number => 10);

  handleErrors = jest.fn(async (): Promise<boolean> => false);
}

describe('TidyBankObjective - recycleExcessEquipment', () => {
  let character: SimpleMockCharacter;

  const makeObjective = (role: 'gearcrafter' | 'jewelrycrafter' | 'weaponcrafter') =>
    new TidyBankObjective(character as any, role);

  beforeEach(() => {
    character = new SimpleMockCharacter();
    jest.clearAllMocks();
  });

  it('returns false when getAllItemInformation fails', async () => {
    mockGetAllItemInformation.mockResolvedValue(
      new ApiError({ code: 500, message: 'Server error' }),
    );

    const result = await makeObjective('gearcrafter').run();

    expect(result).toBe(false);
    expect(character.recycleItemNow).not.toHaveBeenCalled();
  });

  it('skips items not found in the bank', async () => {
    mockGetAllItemInformation.mockResolvedValue(
      makeItemListResponse([makeGear('iron_sword', 15)]) as any,
    );
    character.bankItems = {};

    await makeObjective('weaponcrafter').run();

    expect(character.recycleItemNow).not.toHaveBeenCalled();
  });

  describe('obsolete item recycling (>10 levels below lowestCharLevel)', () => {
    it('recycles all of an item that is more than 10 levels below lowest character level', async () => {
      character.lowestCharLevel = 19;
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('copper_dagger', 5)]) as any,
      );
      character.bankItems = { copper_dagger: 3 };

      await makeObjective('weaponcrafter').run();

      expect(character.recycleItemNow).toHaveBeenCalledWith('copper_dagger', 3);
    });

    it('recycles all obsolete items regardless of quantity (does not keep 5)', async () => {
      character.lowestCharLevel = 19;
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('copper_dagger', 5)]) as any,
      );
      character.bankItems = { copper_dagger: 2 };

      await makeObjective('weaponcrafter').run();

      // Should recycle all 2, not skip because 2 < 5
      expect(character.recycleItemNow).toHaveBeenCalledWith('copper_dagger', 2);
    });

    it('does not recycle an item exactly 10 levels below (boundary: level must be strictly below threshold)', async () => {
      character.lowestCharLevel = 19;
      // threshold = 19 - 10 = 9; item at level 9 is NOT obsolete (not strictly below)
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('iron_helm', 9)]) as any,
      );
      character.bankItems = { iron_helm: 3 };

      await makeObjective('gearcrafter').run();

      // 3 <= 5, so no recycling at all
      expect(character.recycleItemNow).not.toHaveBeenCalled();
    });

    it('recycles an item one level below the threshold', async () => {
      character.lowestCharLevel = 19;
      // threshold = 9; item at level 8 IS obsolete
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('wooden_shield', 8)]) as any,
      );
      character.bankItems = { wooden_shield: 1 };

      await makeObjective('gearcrafter').run();

      expect(character.recycleItemNow).toHaveBeenCalledWith('wooden_shield', 1);
    });

    it('handles multiple items, recycling only the obsolete ones', async () => {
      character.lowestCharLevel = 19;
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([
          makeGear('copper_dagger', 5),  // obsolete (5 <= 9)
          makeGear('iron_sword', 15),    // not obsolete (15 > 9), quantity <= 5 → skip
          makeGear('steel_armor', 17),   // not obsolete (17 > 9), quantity > 5 → trim
        ]) as any,
      );
      character.bankItems = {
        copper_dagger: 4,
        iron_sword: 3,
        steel_armor: 8,
      };

      await makeObjective('gearcrafter').run();

      expect(character.recycleItemNow).toHaveBeenCalledTimes(2);
      expect(character.recycleItemNow).toHaveBeenCalledWith('copper_dagger', 4);
      expect(character.recycleItemNow).toHaveBeenCalledWith('steel_armor', 3); // 8 - 5
    });
  });

  describe('keep-5 recycling (existing logic, non-obsolete items)', () => {
    it('does not recycle when quantity is at or below 5', async () => {
      character.lowestCharLevel = 19;
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('iron_helm', 15)]) as any,
      );
      character.bankItems = { iron_helm: 5 };

      await makeObjective('gearcrafter').run();

      expect(character.recycleItemNow).not.toHaveBeenCalled();
    });

    it('recycles the excess beyond 5 for non-obsolete items', async () => {
      character.lowestCharLevel = 19;
      mockGetAllItemInformation.mockResolvedValue(
        makeItemListResponse([makeGear('iron_helm', 15)]) as any,
      );
      character.bankItems = { iron_helm: 9 };

      await makeObjective('gearcrafter').run();

      expect(character.recycleItemNow).toHaveBeenCalledWith('iron_helm', 4); // 9 - 5
    });
  });

  describe('role routing', () => {
    it.each(['gearcrafter', 'jewelrycrafter', 'weaponcrafter'] as const)(
      'calls recycleExcessEquipment for role: %s',
      async (role) => {
        mockGetAllItemInformation.mockResolvedValue(
          makeItemListResponse([]) as any,
        );

        const result = await makeObjective(role).run();

        expect(result).toBe(true);
        expect(mockGetAllItemInformation).toHaveBeenCalledTimes(1);
      },
    );
  });
});
