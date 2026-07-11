import {
  deriveAcquisitionMethod,
  deriveRequiredLevel,
} from '../../src/wishlist/functions.js';
import { CraftSchema, ItemSchema } from '../../src/types/types.js';

function makeItem(overrides: Partial<ItemSchema>): ItemSchema {
  return {
    name: 'Test Item',
    code: 'test_item',
    level: 1,
    type: 'resource',
    subtype: '',
    description: '',
    tradeable: true,
    ...overrides,
  } as ItemSchema;
}

const craft = (skill: CraftSchema['skill'], level: number): CraftSchema => ({
  skill,
  level,
  items: [],
  quantity: 1,
});

describe('deriveAcquisitionMethod', () => {
  it('uses the gathering subtype for a raw resource (copper_ore -> mining)', () => {
    const item = makeItem({ subtype: 'mining' });
    expect(deriveAcquisitionMethod(item)).toBe('mining');
  });

  it('uses the craft skill for a crafted resource (copper_bar -> mining)', () => {
    const item = makeItem({ subtype: 'bar', craft: craft('mining', 1) });
    expect(deriveAcquisitionMethod(item)).toBe('mining');
  });

  it('uses the craft skill for a weapon (copper_dagger -> weaponcrafting)', () => {
    const item = makeItem({
      type: 'weapon',
      subtype: '',
      craft: craft('weaponcrafting', 1),
    });
    expect(deriveAcquisitionMethod(item)).toBe('weaponcrafting');
  });

  it('prefers craft skill over subtype when both are present', () => {
    // A cooked item has a food subtype but is acquired by cooking.
    const item = makeItem({ subtype: 'food', craft: craft('cooking', 5) });
    expect(deriveAcquisitionMethod(item)).toBe('cooking');
  });

  it('maps a monster-drop resource to fight', () => {
    const item = makeItem({ subtype: 'mob' });
    expect(deriveAcquisitionMethod(item)).toBe('fight');
  });

  it('maps a task-reward item to tasks', () => {
    const item = makeItem({ subtype: 'task' });
    expect(deriveAcquisitionMethod(item)).toBe('tasks');
  });

  it('falls back to buy for anything else', () => {
    const item = makeItem({ subtype: 'currency' });
    expect(deriveAcquisitionMethod(item)).toBe('buy');
  });
});

describe('deriveRequiredLevel', () => {
  it('uses the craft level for a crafted item', () => {
    const item = makeItem({ level: 1, craft: craft('weaponcrafting', 10) });
    expect(deriveRequiredLevel(item)).toBe(10);
  });

  it('uses the item level for a raw resource', () => {
    const item = makeItem({ level: 5 });
    expect(deriveRequiredLevel(item)).toBe(5);
  });
});
