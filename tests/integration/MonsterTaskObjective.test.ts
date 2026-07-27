import { jest } from '@jest/globals';
import { MonsterTaskObjective } from '../../src/core/MonsterTaskObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { InventorySlotSchema, MapSchema } from '../../src/types/types.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };
  lostTooManyFights = false;

  /** Average turns the fight sim should report for the task target */
  simTurns = 5;

  createFakeCharacterSchema = jest.fn((char: any) => ({ ...char }));

  handleErrors = jest.fn(async (): Promise<boolean> => {
    return true;
  });

  move = jest.fn(
    async (destination: { x: number; y: number }): Promise<void> => {
      this.data.x = destination.x;
      this.data.y = destination.y;
    },
  );

  evaluateClosestMap = jest.fn(
    (maps: MapSchema[]): { x: number; y: number } => {
      return { x: maps[0].x, y: maps[0].y };
    },
  );

  findMaps = jest.fn((): MapSchema[] => mockMonsterMapData.data as MapSchema[]);

  fightNow = jest.fn(async (quantity: number): Promise<boolean> => {
    // Mock fighting monsters
    this.data.task_progress += quantity;
    return true;
  });

  // Stands in for really running the job: the fight simulator records its
  // average turns on itself, which is what the task cost estimate reads.
  executeJobNow = jest.fn(async (job?: any): Promise<boolean> => {
    if (job && 'averageTurns' in job) {
      job.averageTurns = this.simTurns;
    }
    return true;
  });

  checkQuantityOfItemInInv = jest.fn((code: string): number => {
    const item = this.data.inventory.find(
      (item: InventorySlotSchema) => item.code === code,
    );
    return item ? item.quantity : 0;
  });

  checkQuantityOfItemInBank = jest.fn(async (): Promise<number> => 39);

  completeTask = jest.fn(async (): Promise<boolean> => {
    this.data.task = '';
    this.data.task_type = '';
    this.data.task_progress = 0;
    this.data.task_total = 0;
    return true;
  });
}

// Mock response data
const mockMonsterMapData = {
  data: [
    {
      map_id: 1,
      name: 'Red Slime Area',
      skin: 'forest',
      x: 100,
      y: 100,
      layer: 'overworld' as const,
      access: {
        type: 'standard' as const,
      },
      interactions: {},
    },
  ],
  total: 1,
  page: 1,
  pages: 1,
  size: 50,
};

describe('MonsterTaskObjective Integration Tests', () => {
  let mockCharacter: SimpleMockCharacter;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock character with clean data
    mockCharacter = new SimpleMockCharacter();
    // Reset character data to original state with deep copy
    mockCharacter.data = JSON.parse(JSON.stringify(mockCharacterData));

    // Set up default mock responses
    mockCharacter.findMaps.mockReturnValue(
      mockMonsterMapData.data as MapSchema[],
    );
  });

  describe('Basic functionality', () => {
    it('should create MonsterTaskObjective with correct properties', () => {
      // Arrange & Act
      const objective = new MonsterTaskObjective(mockCharacter as any, 3);

      // Assert
      expect(objective.quantity).toBe(3);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^task_3_monsters_[a-f0-9]+$/);
      expect(objective.status).toBe('not_started');
      expect(objective.type).toBe('monster');
    });

    it('should successfully complete monster tasks', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's handInTask method
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(5, 'red_slime');
      expect(handInTaskSpy).toHaveBeenCalledWith('monsters');
    });

    it('should start new task when no task is active', async () => {
      // Arrange
      mockCharacter.data.task = undefined;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's startNewTask method
      const startNewTaskSpy = jest
        .spyOn(objective, 'startNewTask')
        .mockResolvedValue(undefined);

      // Act
      const result = await objective.run();

      // Assert
      expect(startNewTaskSpy).toHaveBeenCalledWith('monsters');
      // startNewTask is stubbed here, so no task is actually assigned. With
      // nothing to target the job has to stop: an empty content_code matches
      // every monster map, which would otherwise send it to fight a random mob.
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });

    it('should continue existing task when task is active', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 2;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's startNewTask method
      const startNewTaskSpy = jest
        .spyOn(objective, 'startNewTask')
        .mockResolvedValue(undefined);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(startNewTaskSpy).not.toHaveBeenCalled();
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(3, 'red_slime'); // 5 - 2 = 3 remaining
    });
  });

  describe('Progress tracking', () => {
    it('should track progress correctly', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(objective.progress).toBe(1);
    });

    it('should increment progress only when task succeeds', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;
      mockCharacter.fightNow.mockResolvedValue(false); // Fight fails

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(objective.progress).toBe(0); // Progress should not increment on failure
    });

    it('should complete when progress reaches target quantity', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 3;

      const objective = new MonsterTaskObjective(mockCharacter as any, 2);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(objective.progress).toBe(2);
    });
  });

  describe('Error handling', () => {
    it('should handle no maps found', async () => {
      // Arrange
      mockCharacter.findMaps.mockReturnValue([]);

      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });

    it('should handle fight failures and retry', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;
      mockCharacter.fightNow
        .mockResolvedValueOnce(false) // First attempt fails
        .mockResolvedValueOnce(true); // Second attempt succeeds

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(2);
    });

    it('should cancel the task and stop retrying when too many fights are lost', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;
      mockCharacter.fightNow.mockImplementation(async () => {
        mockCharacter.lostTooManyFights = true;
        return false;
      });

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      const cancelTaskSpy = jest
        .spyOn(objective, 'cancelCurrentTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(cancelTaskSpy).toHaveBeenCalledWith('monsters');
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(1); // No retries after bailing
    });

    it('should return false when max retries exceeded for fights', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;
      mockCharacter.fightNow.mockResolvedValue(false); // All attempts fail

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(3); // maxRetries = 3
    });
  });

  describe('Edge cases', () => {
    it('should handle cancellation during execution', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Simulate cancellation by making the objective cancelled
      objective.cancelJob();

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).not.toHaveBeenCalled();
    });

    it('should handle cancellation during task loop', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 2);

      // Mock fight to succeed once, then cancel
      let fightCount = 0;
      mockCharacter.fightNow.mockImplementation(async () => {
        fightCount++;
        if (fightCount === 1) {
          objective.cancelJob();
        }
        return true;
      });

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(1);
    });

    it('should handle task completion when progress equals total', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 5;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's handInTask method
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(handInTaskSpy).toHaveBeenCalledWith('monsters');
    });

    it('should handle different monster types', async () => {
      // Test various monster types
      const monsterTests = [
        { task: 'red_slime', total: 3 },
        { task: 'blue_slime', total: 2 },
        { task: 'green_slime', total: 1 },
      ];

      for (const test of monsterTests) {
        // Arrange
        mockCharacter.data.task = test.task;
        mockCharacter.data.task_type = 'monsters';
        mockCharacter.data.task_progress = 0;
        mockCharacter.data.task_total = test.total;

        const testMapData = {
          data: [
            {
              map_id: 1,
              name: `${test.task} Area`,
              skin: 'forest',
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
        mockCharacter.findMaps.mockReturnValue(testMapData.data as MapSchema[]);

        const objective = new MonsterTaskObjective(mockCharacter as any, 1);

        // Act
        const result = await objective.run();

        // Assert
        expect(result).toBe(true);
        expect(mockCharacter.findMaps).toHaveBeenCalledWith({
          content_code: test.task,
          content_type: 'monster',
        });
        expect(mockCharacter.fightNow).toHaveBeenCalledWith(
          test.total,
          test.task,
        );

        // Reset for next test
        jest.clearAllMocks();
        mockCharacter.findMaps.mockReturnValue(testMapData.data as MapSchema[]);
      }
    });

    it('should handle movement to monster location', async () => {
      // Arrange
      const customMapData = {
        data: [
          {
            map_id: 2,
            name: 'Custom Monster Area',
            skin: 'cave',
            x: 200,
            y: 300,
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
      mockCharacter.findMaps.mockReturnValue(customMapData.data as MapSchema[]);
      mockCharacter.evaluateClosestMap.mockReturnValue({ x: 200, y: 300 });

      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.evaluateClosestMap).toHaveBeenCalledWith(
        customMapData.data,
      );
      expect(mockCharacter.move).toHaveBeenCalledWith({ x: 200, y: 300 });
    });

    it('should handle partial task completion', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 2;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(3, 'red_slime'); // 5 - 2 = 3 remaining
    });
  });

  // Every monster task pays the same 3-5 coins whatever the target or size, so a
  // task's worth is decided by how long it will take. Turn counts here are the
  // ones measured in production for LongLegLarry (haste 9).
  describe('Rejecting tasks that cost too much time', () => {
    const setTask = (code: string, total: number, progress = 0) => {
      mockCharacter.data.task = code;
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_total = total;
      mockCharacter.data.task_progress = progress;
      mockCharacter.data.haste = 9;
    };

    const spyOnTaskChanges = (objective: MonsterTaskObjective) => ({
      cancel: jest
        .spyOn(objective, 'cancelCurrentTask')
        .mockResolvedValue(true),
      start: jest.spyOn(objective, 'startNewTask').mockResolvedValue(undefined),
    });

    it('keeps a big task against a cheap target', async () => {
      // 400 sheep at 5 turns => ~1.0h, comfortably inside the budget
      setTask('sheep', 400);
      mockCharacter.simTurns = 5;
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel).not.toHaveBeenCalled();
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(400, 'sheep');
    });

    it('cancels a small task against an expensive target', async () => {
      // 229 imps at 74 turns => ~8.6h for the same reward
      setTask('imp', 229);
      mockCharacter.simTurns = 74;
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel).toHaveBeenCalledWith('monsters');
      expect(spies.start).toHaveBeenCalledWith('monsters');
    });

    it('judges the fights still remaining, not the whole task', async () => {
      // 300 skeletons at 20 turns would be ~3h, but only 50 are left => ~0.5h
      setTask('skeleton', 300, 250);
      mockCharacter.simTurns = 20;
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel).not.toHaveBeenCalled();
      expect(mockCharacter.fightNow).toHaveBeenCalledWith(50, 'skeleton');
    });

    it('gives up rerolling rather than burning coins indefinitely', async () => {
      setTask('imp', 400);
      mockCharacter.simTurns = 74;
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it('will not reroll when task coins are nearly out', async () => {
      setTask('imp', 400);
      mockCharacter.simTurns = 74;
      mockCharacter.checkQuantityOfItemInInv.mockImplementation(
        (code: string) => (code === 'tasks_coin' ? 1 : 0),
      );
      mockCharacter.checkQuantityOfItemInBank.mockResolvedValue(0);
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel).not.toHaveBeenCalled();
    });

    it('rerolls a task whose target it cannot beat', async () => {
      // No winning simulation means no turn count and no way to finish
      setTask('death_knight', 100);
      mockCharacter.simTurns = 0;
      const objective = new MonsterTaskObjective(mockCharacter as any, 1);
      jest.spyOn(objective, 'handInTask').mockResolvedValue(true);
      const spies = spyOnTaskChanges(objective);

      await objective.run();

      expect(spies.cancel).toHaveBeenCalledWith('monsters');
    });
  });

  describe('Task management', () => {
    it('should not hand in task if progress is not complete', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 2;
      mockCharacter.data.task_total = 5;
      mockCharacter.fightNow.mockResolvedValue(false); // Fight fails

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's handInTask method
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(handInTaskSpy).not.toHaveBeenCalled();
    });

    it('should hand in task when progress equals total', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 5;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's handInTask method
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(handInTaskSpy).toHaveBeenCalledWith('monsters');
    });

    it('should handle task hand-in failures', async () => {
      // Arrange
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 5;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Mock the Objective's handInTask method to fail
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(false);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(handInTaskSpy).toHaveBeenCalledWith('monsters');
    });
  });
});
