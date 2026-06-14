import { CraftObjective } from '../../src/core/CraftObjective.js';

describe('CraftObjective.batchQuantity', () => {
  it('returns the full batch size while plenty remains', () => {
    expect(CraftObjective.batchQuantity(123, 2704, 0)).toBe(123);
    expect(CraftObjective.batchQuantity(123, 2704, 2460)).toBe(123);
  });

  it('clamps the final batch to the remainder (the TimidTom raw_chicken bug)', () => {
    // 2704 / 123 -> 22 batches; after 21 batches progress is 2583, leaving 121.
    // Without clamping this returned 123 and forced gathering 2 nonexistent items.
    expect(CraftObjective.batchQuantity(123, 2704, 2583)).toBe(121);
  });

  it('returns the full batch size when the target is an exact multiple', () => {
    // 2706 = 22 * 123; the last batch should still be a full 123.
    expect(CraftObjective.batchQuantity(123, 2706, 2583)).toBe(123);
  });

  it('never exceeds the outstanding amount', () => {
    for (let progress = 0; progress <= 2704; progress += 123) {
      const batch = CraftObjective.batchQuantity(123, 2704, progress);
      expect(batch).toBeLessThanOrEqual(2704 - progress);
    }
  });
});
