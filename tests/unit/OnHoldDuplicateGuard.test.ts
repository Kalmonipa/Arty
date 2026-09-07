import { jest } from '@jest/globals';

jest.mock('../../src/wishlist/wishlist.utils.js', () => ({
  addToWishlist: jest.fn(async () => 1),
  findOpenWishlistRequest: jest.fn(async () => undefined),
  getWishlistRequestsForJob: jest.fn(async () => []),
  deleteWishlistRequestsForJob: jest.fn(async () => 0),
}));

import { Character } from '../../src/character/character.js';
import { CraftObjective } from '../../src/core/CraftObjective.js';
import { deleteWishlistRequestsForJob } from '../../src/wishlist/wishlist.utils.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { OnHoldJob } from '../../src/types/ObjectiveData.js';
import { Objective } from '../../src/core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveResult,
} from '../../src/types/ObjectiveData.js';
import { Gearcrafting, Weaponcrafting } from '../../src/names.js';

class TestObjective extends Objective {
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}

const parked = (objectiveId: string) => ({ job: { objectiveId } }) as any;

/** Mirrors what serializeJob persists for a parked CraftObjective */
const parkedCraft = (
  objectiveId: string,
  code: string,
  quantity: number,
): OnHoldJob =>
  ({
    job: {
      type: 'CraftObjective',
      objectiveId,
      status: 'on_hold',
      progress: 0,
      maxRetries: 3,
      target: { code, quantity },
      checkBank: undefined,
      includeInventory: true,
      blockOnMissing: true,
    },
    parkedAt: '2026-09-02T12:23:01.000Z',
    retried: false,
  }) as unknown as OnHoldJob;

const makeObjective = (onHold: any[]) => {
  const character = { data: { name: 'LongLegLarry' }, onHold } as any;
  return new TestObjective(character, 'idle_crafter_objective', 'not_started');
};

describe('checkForJobInOnHoldQueue', () => {
  it('allows training a skill with nothing parked for it', () => {
    const objective = makeObjective([]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(false);
  });

  // Duplicates each raise their own wishlist request for the same materials, so
  // three parked copies asked for three times what was actually needed and
  // crowded the other skills out of the fixed-size onHold queue.
  it('blocks a second job once one is already parked for that skill', () => {
    const objective = makeObjective([parked('train_30_gearcrafting_bd73')]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(true);
  });

  it('does not let one skill block a different one', () => {
    const objective = makeObjective([parked('train_33_weaponcrafting_d6bb')]);

    expect(objective.checkForJobInOnHoldQueue(Gearcrafting)).toBe(false);
    expect(objective.checkForJobInOnHoldQueue(Weaponcrafting)).toBe(true);
  });
});

describe('Character.hasParkedCraftFor', () => {
  let character: Character;

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
  });

  it('reports nothing parked for an item when the queue is empty', () => {
    expect(character.hasParkedCraftFor('mithril_pickaxe')).toBe(false);
  });

  it('finds a parked craft for the same item', () => {
    character.onHold = [
      parkedCraft('craft_1_mithril_pickaxe_4a75', 'mithril_pickaxe', 1),
    ];

    expect(character.hasParkedCraftFor('mithril_pickaxe')).toBe(true);
  });

  // Matching on the objectiveId the way the train guard does would report
  // mithril_axe as parked, because 'craft_1_mithril_pickaxe_4a75' contains 'axe'
  it('does not mistake a parked mithril_pickaxe for a parked mithril_axe', () => {
    character.onHold = [
      parkedCraft('craft_1_mithril_pickaxe_4a75', 'mithril_pickaxe', 1),
    ];

    expect(character.hasParkedCraftFor('mithril_axe')).toBe(false);
  });

  // Both copies raise their own wishlist request against the same scarce
  // ingredient, so a larger order is still a duplicate
  it('counts a different quantity of the same item as already parked', () => {
    character.onHold = [
      parkedCraft('craft_5_mithril_axe_19f7', 'mithril_axe', 5),
    ];

    expect(character.hasParkedCraftFor('mithril_axe')).toBe(true);
  });

  it('ignores a parked job of another type that targets the item', () => {
    character.onHold = [
      {
        job: {
          type: 'GatherObjective',
          objectiveId: 'gather_3_mithril_axe_9c39',
          status: 'on_hold',
          progress: 0,
          maxRetries: 3,
          target: { code: 'mithril_axe', quantity: 3 },
        },
        parkedAt: '2026-09-02T12:23:01.000Z',
        retried: false,
      } as unknown as OnHoldJob,
    ];

    expect(character.hasParkedCraftFor('mithril_axe')).toBe(false);
  });
});

describe('Character.parkJob duplicate craft backstop', () => {
  let character: Character;

  beforeEach(() => {
    character = new Character({ ...mockCharacterData });
    character.saveJobQueue = jest.fn(async () => {});
    (deleteWishlistRequestsForJob as jest.Mock).mockClear();
  });

  it('refuses to park a second craft for an item already parked', async () => {
    character.onHold = [
      parkedCraft('craft_1_mithril_axe_19f7', 'mithril_axe', 1),
    ];
    const duplicate = new CraftObjective(
      character,
      { code: 'mithril_axe', quantity: 1 },
      undefined,
      undefined,
      true,
    );

    const parked = await character.parkJob(duplicate);

    expect(parked).toBe(false);
    expect(character.onHold).toHaveLength(1);
  });

  // The refused job already raised its requests; leaving them behind would
  // inflate demand for an ingredient the parked twin is already waiting on
  it('clears the wishlist requests raised by the craft it refused', async () => {
    character.onHold = [
      parkedCraft('craft_1_mithril_axe_19f7', 'mithril_axe', 1),
    ];
    const duplicate = new CraftObjective(
      character,
      { code: 'mithril_axe', quantity: 1 },
      undefined,
      undefined,
      true,
    );

    await character.parkJob(duplicate);

    expect(deleteWishlistRequestsForJob).toHaveBeenCalledWith(
      character.data.name,
      duplicate.objectiveId,
    );
  });

  it('still parks a craft for an item nothing is parked for', async () => {
    character.onHold = [
      parkedCraft('craft_1_mithril_axe_19f7', 'mithril_axe', 1),
    ];
    const other = new CraftObjective(
      character,
      { code: 'mithril_gloves', quantity: 1 },
      undefined,
      undefined,
      true,
    );

    const parked = await character.parkJob(other);

    expect(parked).toBe(true);
    expect(character.onHold).toHaveLength(2);
  });
});
