import { BossFightRoster } from '../../src/fightBosses/bossFight.types.js';
import {
  isRaidRunning,
  RaidLeaderRole,
  RaidRoster,
  RaidWinRateThreshold,
} from '../../src/fightRaids/raid.utils.js';
import { RaidSchema, RaidStatus } from '../../src/types/types.js';

const raidWith = (status: RaidStatus) =>
  ({ code: 'enchanted_fairy', monster: 'pixie', status }) as RaidSchema;

describe('the raid party', () => {
  it('sends one tank and two healers', () => {
    // Surviving all 100 turns is the win, and the boss spends its share of them
    // on whoever holds the highest threat. One character holding it is what frees
    // the other two to spend their utility slots on splash healing instead of
    // funding their own restores.
    expect(RaidRoster.map((member) => member.role)).toEqual([
      'healer',
      'healer',
    ]);
    expect(RaidLeaderRole).toBe('tank');
  });

  it('calls up the same characters a boss fight does', () => {
    expect(RaidRoster.map((member) => member.characterName)).toEqual(
      BossFightRoster.map((member) => member.characterName),
    );
  });
});

describe('committing to a raid', () => {
  it('accepts worse odds than an ordinary fight does', () => {
    expect(RaidWinRateThreshold).toBeLessThan(80);
  });
});

describe('isRaidRunning', () => {
  it('is running while the window is open', () => {
    expect(isRaidRunning(raidWith(RaidStatus.active))).toBe(true);
  });

  it('is not running before it opens', () => {
    expect(isRaidRunning(raidWith(RaidStatus.upcoming))).toBe(false);
  });

  it('is not running once the boss is dead', () => {
    expect(isRaidRunning(raidWith(RaidStatus.finished_success))).toBe(false);
  });

  it('is not running once the window has closed', () => {
    expect(isRaidRunning(raidWith(RaidStatus.finished_failure))).toBe(false);
  });

  it('is not running when there is no raid to read', () => {
    expect(isRaidRunning(undefined)).toBe(false);
  });
});
