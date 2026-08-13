import { parseTrainJobId } from '../../src/idleObjectives/idleUtils.js';

describe('parseTrainJobId', () => {
  it('reads the target level and skill off a crafting train job', () => {
    expect(parseTrainJobId('train_30_gearcrafting_bd73')).toEqual({
      targetLevel: 30,
      skill: 'gearcrafting',
    });
  });

  it('reads a gathering train job', () => {
    expect(parseTrainJobId('train_25_woodcutting_a1b2')).toEqual({
      targetLevel: 25,
      skill: 'woodcutting',
    });
  });

  // Combat has no Skill value, so it reports undefined and getCharacterLevel
  // falls through to the character's combat level
  it('reports combat train jobs with no skill', () => {
    expect(parseTrainJobId('train_40_combat_9f0e')).toEqual({
      targetLevel: 40,
      skill: undefined,
    });
  });

  it('ignores jobs that are not train jobs', () => {
    expect(parseTrainJobId('craft_5_snakeskin_boots_56c3')).toBeUndefined();
    expect(parseTrainJobId('idle_crafter_objective_5036')).toBeUndefined();
    expect(parseTrainJobId('withdraw_50_cooked_bass_ed70')).toBeUndefined();
  });
});
