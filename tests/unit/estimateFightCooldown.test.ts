import { estimateFightCooldown } from '../../src/utils.js';

describe('estimateFightCooldown', () => {
  // The game's formula is turns x 2, reduced by haste, with a 5s floor.
  it('matches the cooldowns observed in production', () => {
    // LongLegLarry (haste 9) sees 36s for a 20-turn skeleton fight
    expect(Math.round(estimateFightCooldown(20, 9))).toBe(36);
    // ...and 9s for a 5-turn sheep fight
    expect(Math.round(estimateFightCooldown(5, 9))).toBe(9);
  });

  it('scales linearly with turns', () => {
    expect(estimateFightCooldown(40, 0)).toBe(2 * estimateFightCooldown(20, 0));
  });

  it('applies haste as a percentage reduction', () => {
    expect(estimateFightCooldown(20, 10)).toBeCloseTo(36);
    expect(estimateFightCooldown(20, 0)).toBe(40);
  });

  it('never returns less than the 5s floor', () => {
    expect(estimateFightCooldown(1, 0)).toBe(5);
    expect(estimateFightCooldown(2, 90)).toBe(5);
  });
});
