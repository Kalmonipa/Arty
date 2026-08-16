import { craftingSkillsToTrain } from '../../src/idleObjectives/idle.utils.js';
import {
  Gearcrafting,
  Jewelrycrafting,
  Weaponcrafting,
} from '../../src/names.js';

describe('craftingSkillsToTrain', () => {
  it('puts the furthest-behind skill first', () => {
    const order = craftingSkillsToTrain(
      [
        { skill: Weaponcrafting, level: 32 },
        { skill: Gearcrafting, level: 29 },
        { skill: Jewelrycrafting, level: 30 },
      ],
      39,
    );

    expect(order).toEqual([Gearcrafting, Jewelrycrafting, Weaponcrafting]);
  });

  it('leaves out skills that have caught up with combat level', () => {
    const order = craftingSkillsToTrain(
      [
        { skill: Weaponcrafting, level: 39 },
        { skill: Gearcrafting, level: 29 },
        { skill: Jewelrycrafting, level: 40 },
      ],
      39,
    );

    expect(order).toEqual([Gearcrafting]);
  });

  it('returns nothing when every skill is at or above combat level', () => {
    const order = craftingSkillsToTrain(
      [
        { skill: Weaponcrafting, level: 39 },
        { skill: Gearcrafting, level: 39 },
        { skill: Jewelrycrafting, level: 39 },
      ],
      39,
    );

    expect(order).toEqual([]);
  });

  it('keeps a stable order for skills on the same level', () => {
    const order = craftingSkillsToTrain(
      [
        { skill: Weaponcrafting, level: 20 },
        { skill: Gearcrafting, level: 20 },
        { skill: Jewelrycrafting, level: 20 },
      ],
      39,
    );

    expect(order).toEqual([Weaponcrafting, Gearcrafting, Jewelrycrafting]);
  });
});
