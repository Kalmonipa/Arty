import { jest } from '@jest/globals';
import { GatherObjective } from '../../src/core/GatherObjective.js';
import { ObjectiveTargets } from '../../src/types/ObjectiveData.js';
import {
  MapSchema,
  ItemSchema,
  CharacterSchema,
} from '../../src/types/types.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlot } from '../../src/types/CharacterData.js';

import { getItemInformation } from '../../src/api_calls/Items.js';
import { getAllResourceInformation } from '../../src/api_calls/Resources.js';
import { actionGather } from '../../src/api_calls/Actions.js';

jest.mock('../../src/api_calls/Actions', () => ({
  actionGather: jest.fn(),
}));
jest.mock('../../src/api_calls/Items', () => ({
  getItemInformation: jest.fn(),
}));
jest.mock('../../src/api_calls/Monsters', () => ({
  getAllMonsterInformation: jest.fn(),
}));
jest.mock('../../src/api_calls/Resources', () => ({
  getAllResourceInformation: jest.fn(),
}));

const mockIronOreItem: ItemSchema = {
  code: 'iron_ore',
  name: 'Iron Ore',
  level: 10,
  type: 'resource',
  subtype: 'mining',
  description: '',
  conditions: [],
  effects: [],
  craft: null,
  tradeable: true,
};

const mockResourceData = {
  data: [
    {
      name: 'Iron Rocks',
      code: 'iron_rocks',
      skill: 'mining' as const,
      level: 10,
      drops: [{ code: 'iron_ore', rate: 1, min_quantity: 1, max_quantity: 1 }],
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
  size: 50,
};

const mockMapData = {
  data: [
    {
      map_id: 1,
      name: 'Iron Mine',
      skin: 'mine',
      x: 100,
      y: 100,
      layer: 'overworld' as const,
      access: { type: 'standard' as const },
      interactions: {},
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
  size: 50,
};

class MockCharacter {
  data: any = {
    ...mockCharacterData,
    mining_level: 20,
    inventory_max_items: 118,
    inventory: [] as InventorySlot[],
  };
  enableEvents = false;

  addItemToInventory = (code: string, quantity: number): void => {
    const item = this.data.inventory.find(
      (i: InventorySlot) => i.code === code,
    );
    if (item) item.quantity += quantity;
    else this.data.inventory.push({ slot: 10, code, quantity });
  };

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (i: InventorySlot) => i.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(
    async (_code: string): Promise<number> => 0,
  );

  evaluateDepositItemsInBank = jest.fn(async (): Promise<void> => {});
  saveJobQueue = jest.fn(async (): Promise<void> => {});
  evaluateGear = jest.fn(async (): Promise<void> => {});
  handleErrors = jest.fn(async (): Promise<boolean> => true);
  move = jest.fn(async (): Promise<void> => {});
  evaluateClosestMap = jest.fn((maps: MapSchema[]) => ({
    x: maps[0].x,
    y: maps[0].y,
  }));
  findMaps = jest.fn((): MapSchema[] => mockMapData.data as MapSchema[]);
  getCharacterLevel = jest.fn(
    (_char?: CharacterSchema, _skill?: string): number => 99,
  );
}

describe('GatherObjective progress reflects actual held stock', () => {
  let character: MockCharacter;
  const location = { x: 0, y: 0 } as MapSchema;

  beforeEach(() => {
    jest.clearAllMocks();
    character = new MockCharacter();

    (
      actionGather as jest.MockedFunction<typeof actionGather>
    ).mockImplementation(async () => {
      character.addItemToInventory('iron_ore', 1);
      return {
        data: {
          character: character.data,
          cooldown: {
            total_seconds: 1,
            remaining_seconds: 0,
            started_at: '2026-07-13T00:00:00Z',
            expiration: '2026-07-13T00:00:01Z',
            reason: 'gathering',
          },
          details: { xp: 1, items: [{ code: 'iron_ore', quantity: 1 }] },
        },
      } as any;
    });
  });

  it('counts existing bank stock toward the target and gathers only the shortfall', async () => {
    // Target 10, already 5 banked -> only 5 need gathering.
    character.checkQuantityOfItemInBank.mockResolvedValue(5);
    const target: ObjectiveTargets = { code: 'iron_ore', quantity: 10 };
    const objective = new GatherObjective(character as any, target, true);

    await objective.gatherItemLoop(location, ['iron_ore']);

    expect(actionGather).toHaveBeenCalledTimes(5);
    expect(character.checkQuantityOfItemInBank).toHaveBeenCalled();
    expect(objective.progress).toBe(10);
  });

  it('counts pre-existing inventory toward the target, ignoring a stale requested count', async () => {
    // Already holding 5, target 10 -> gather 5 even though the loop was asked for 10.
    character.addItemToInventory('iron_ore', 5);
    const target: ObjectiveTargets = { code: 'iron_ore', quantity: 10 };
    const objective = new GatherObjective(character as any, target);

    await objective.gatherItemLoop(location, ['iron_ore']);

    expect(actionGather).toHaveBeenCalledTimes(5);
    expect(character.checkQuantityOfItemInInv('iron_ore')).toBe(10);
  });

  it('recomputes from inventory+bank at most every 5 gathers, not every gather', async () => {
    const target: ObjectiveTargets = { code: 'iron_ore', quantity: 20 };
    const objective = new GatherObjective(character as any, target, true);

    await objective.gatherItemLoop(location, ['iron_ore']);

    expect(actionGather).toHaveBeenCalledTimes(20);
    // Throttled: read at iterations 0,5,10,15,20 rather than once per gather.
    expect(character.checkQuantityOfItemInBank).toHaveBeenCalledTimes(5);
  });

  it('threads itemsToKeep through gather() into the in-loop deposit call', async () => {
    (
      getItemInformation as jest.MockedFunction<typeof getItemInformation>
    ).mockResolvedValue(mockIronOreItem);
    (
      getAllResourceInformation as jest.MockedFunction<
        typeof getAllResourceInformation
      >
    ).mockResolvedValue(mockResourceData as any);

    const target: ObjectiveTargets = { code: 'iron_ore', quantity: 3 };
    const objective = new GatherObjective(character as any, target);

    await objective.gather(3, 'iron_ore');

    // The in-loop deposit must receive the keep-list (2-arg form with a location),
    // not undefined. Only the pre-loop call passes it as a single arg today.
    expect(character.evaluateDepositItemsInBank).toHaveBeenCalledWith(
      ['iron_ore'],
      expect.anything(),
    );
  });
});
