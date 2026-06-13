import { jest } from '@jest/globals';
import { mockCharacterData } from '../mocks/apiMocks.js';

jest.mock('../../src/api_calls/Actions.js', () => ({
  actionMove: jest.fn(),
  actionRest: jest.fn(),
  actionDepositItems: jest.fn(),
  actionTransition: jest.fn(),
  actionUse: jest.fn(),
}));
jest.mock('../../src/api_calls/Items.js', () => ({
  getItemInformation: jest.fn(),
  getAllItemInformation: jest.fn(),
  actionUse: jest.fn(),
}));
jest.mock('../../src/api_calls/Maps.js', () => ({
  getMaps: jest.fn(),
  getMapsById: jest.fn(),
}));
jest.mock('../../src/api_calls/Bank.js', () => ({
  getBankItems: jest.fn(async () => ({
    data: [],
    total: 0,
    page: 1,
    size: 50,
  })),
}));
jest.mock('../../src/api_calls/Events.js', () => ({
  getActiveEvents: jest.fn(),
}));
jest.mock('../../src/api_calls/Resources.js', () => ({
  getAllResourceInformation: jest.fn(),
  getResourceInformation: jest.fn(),
}));
jest.mock('../../src/api_calls/Tasks.js', () => ({
  actionCompleteTask: jest.fn(),
  actionTasksTrade: jest.fn(),
}));
jest.mock('../../src/api_calls/NPC.js', () => ({
  getNpc: jest.fn(),
}));

import { Character } from '../../src/core/Character.js';
import * as fs from 'node:fs/promises';

const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockMkdir = fs.mkdir as jest.MockedFunction<typeof fs.mkdir>;

const TEN_MINUTES = 10 * 60;
const EIGHT_HOURS = 8 * 60 * 60;

describe('Character - event backoff', () => {
  let character: Character;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined as any);
    mockWriteFile.mockResolvedValue(undefined as any);
    character = new Character({ ...mockCharacterData });
  });

  describe('recordEventFailure', () => {
    it('sets a 10-minute backoff on first failure', () => {
      const before = Math.round(Date.now() / 1000);
      character.recordEventFailure('corrupted_ogre');

      const entry = character.eventBackoffs.get('corrupted_ogre');
      expect(entry).toBeDefined();
      expect(entry.failCount).toBe(1);
      expect(entry.nextRetryAt).toBeGreaterThanOrEqual(before + TEN_MINUTES);
      expect(entry.nextRetryAt).toBeLessThanOrEqual(before + TEN_MINUTES + 2);
    });

    it('doubles the backoff on each subsequent failure', () => {
      const before = Math.round(Date.now() / 1000);

      character.recordEventFailure('corrupted_ogre'); // 10 min
      character.recordEventFailure('corrupted_ogre'); // 20 min
      character.recordEventFailure('corrupted_ogre'); // 40 min

      const entry = character.eventBackoffs.get('corrupted_ogre');
      expect(entry.failCount).toBe(3);
      // Third failure: 10min * 2^2 = 40min
      expect(entry.nextRetryAt).toBeGreaterThanOrEqual(before + 40 * 60);
    });

    it('caps backoff at 8 hours', () => {
      const before = Math.round(Date.now() / 1000);

      // 7 failures: 10min * 2^6 = 640min > 8h, so should cap at 8h
      for (let i = 0; i < 7; i++) {
        character.recordEventFailure('corrupted_ogre');
      }

      const entry = character.eventBackoffs.get('corrupted_ogre');
      expect(entry.nextRetryAt).toBeLessThanOrEqual(before + EIGHT_HOURS + 2);
    });

    it('tracks each event code independently', () => {
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('bandit_camp');

      expect(character.eventBackoffs.get('corrupted_ogre').failCount).toBe(2);
      expect(character.eventBackoffs.get('bandit_camp').failCount).toBe(1);
    });
  });

  describe('recordEventSuccess', () => {
    it('clears the backoff entry for the event', () => {
      character.recordEventFailure('corrupted_ogre');
      expect(character.eventBackoffs.has('corrupted_ogre')).toBe(true);

      character.recordEventSuccess('corrupted_ogre');
      expect(character.eventBackoffs.has('corrupted_ogre')).toBe(false);
    });

    it('is a no-op when there is no backoff entry', () => {
      expect(() =>
        character.recordEventSuccess('corrupted_ogre'),
      ).not.toThrow();
      expect(character.eventBackoffs.has('corrupted_ogre')).toBe(false);
    });

    it('does not affect other events', () => {
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('bandit_camp');

      character.recordEventSuccess('corrupted_ogre');

      expect(character.eventBackoffs.has('corrupted_ogre')).toBe(false);
      expect(character.eventBackoffs.has('bandit_camp')).toBe(true);
    });

    it('resets the backoff so the next failure starts at 10 minutes again', () => {
      const before = Math.round(Date.now() / 1000);
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('corrupted_ogre');
      character.recordEventSuccess('corrupted_ogre');
      character.recordEventFailure('corrupted_ogre');

      const entry = character.eventBackoffs.get('corrupted_ogre');
      expect(entry.failCount).toBe(1);
      expect(entry.nextRetryAt).toBeGreaterThanOrEqual(before + TEN_MINUTES);
    });
  });

  describe('saveJobQueue / loadJobQueue persistence', () => {
    it('saveJobQueue includes eventBackoffs in written JSON', async () => {
      character.recordEventFailure('corrupted_ogre');

      await character.saveJobQueue();

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(written.eventBackoffs).toEqual({
        corrupted_ogre: {
          failCount: 1,
          nextRetryAt: expect.any(Number),
        },
      });
    });

    it('saveJobQueue writes an empty eventBackoffs object when no failures recorded', async () => {
      await character.saveJobQueue();

      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(written.eventBackoffs).toEqual({});
    });

    it('loadJobQueue restores eventBackoffs from file', async () => {
      const nextRetryAt = Math.round(Date.now() / 1000) + 3600;
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          characterName: 'TestCharacter',
          enableEvents: true,
          itemsToKeep: [],
          eventBackoffs: {
            corrupted_ogre: { failCount: 2, nextRetryAt },
          },
          jobs: [],
        }) as any,
      );

      await character.loadJobQueue();

      expect(character.eventBackoffs.get('corrupted_ogre')).toEqual({
        failCount: 2,
        nextRetryAt,
      });
    });

    it('loadJobQueue starts with empty eventBackoffs when field is absent from file', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          characterName: 'TestCharacter',
          enableEvents: true,
          itemsToKeep: [],
          jobs: [],
        }) as any,
      );

      await character.loadJobQueue();

      expect(character.eventBackoffs.size).toBe(0);
    });

    it('roundtrips multiple event backoffs through save and load', async () => {
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('corrupted_ogre');
      character.recordEventFailure('bandit_camp');

      await character.saveJobQueue();

      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      mockReadFile.mockResolvedValue(JSON.stringify(written) as any);

      const character2 = new Character({ ...mockCharacterData });
      await character2.loadJobQueue();

      expect(character2.eventBackoffs.get('corrupted_ogre').failCount).toBe(2);
      expect(character2.eventBackoffs.get('bandit_camp').failCount).toBe(1);
    });
  });

  describe('getCharacterGearIn - artifact slots', () => {
    it('returns the correct item code for artifact1, artifact2, artifact3 slots', () => {
      const char = new Character({
        ...mockCharacterData,
        artifact1_slot: 'lucky_charm',
        artifact2_slot: 'golden_earring',
        artifact3_slot: '',
      });

      expect(char.getCharacterGearIn('artifact1')).toBe('lucky_charm');
      expect(char.getCharacterGearIn('artifact2')).toBe('golden_earring');
      expect(char.getCharacterGearIn('artifact3')).toBe('');
    });
  });
});
