import { jest } from '@jest/globals';
import { MonsterTaskObjective } from '../../src/classes/MonsterTaskObjective.js';
import { mockCharacterData } from '../mocks/apiMocks.js';
import { ApiError } from '../../src/classes/Error.js';

// Mock the API modules
jest.mock('../../src/api_calls/Maps', () => ({
  getMaps: jest.fn(),
}));

// Import the mocked functions
import { getMaps } from '../../src/api_calls/Maps.js';
import { MapSchema } from '../../src/types/MapData.js';

// Simple mock character
class SimpleMockCharacter {
  data = { ...mockCharacterData };

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

  fightNow = jest.fn(async (quantity: number): Promise<boolean> => {
    // Mock fighting monsters
    this.data.task_progress += quantity;
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
    (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
      mockMonsterMapData,
    );
  });

  describe('Basic functionality', () => {
    it('should create MonsterTaskObjective with correct properties', () => {
      // Arrange & Act
      const objective = new MonsterTaskObjective(mockCharacter as any, 3);

      // Assert
      expect(objective.quantity).toBe(3);
      expect(objective.character).toBe(mockCharacter);
      expect(objective.objectiveId).toMatch(/^task_3_monstertask_[a-f0-9]+$/);
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
      expect(result).toBe(true);
      expect(startNewTaskSpy).toHaveBeenCalledWith('monsters');
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

    it('should handle multiple task completions', async () => {
      // Arrange - set up for 2 separate tasks
      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 3;

      const objective = new MonsterTaskObjective(mockCharacter as any, 2);

      // Mock the Objective's handInTask method
      const handInTaskSpy = jest
        .spyOn(objective, 'handInTask')
        .mockResolvedValue(true);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(true);
      expect(mockCharacter.fightNow).toHaveBeenCalledTimes(2);
      // For multiple tasks, handInTask should be called once per completed task
      expect(handInTaskSpy).toHaveBeenCalledTimes(1);
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
    it('should handle getMaps API errors', async () => {
      // Arrange
      const apiError = new ApiError({ code: 500, message: 'Maps API error' });
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        apiError,
      );
      mockCharacter.handleErrors.mockResolvedValue(false);

      mockCharacter.data.task = 'red_slime';
      mockCharacter.data.task_type = 'monsters';
      mockCharacter.data.task_progress = 0;
      mockCharacter.data.task_total = 5;

      const objective = new MonsterTaskObjective(mockCharacter as any, 1);

      // Act
      const result = await objective.run();

      // Assert
      expect(result).toBe(false);
      expect(mockCharacter.handleErrors).toHaveBeenCalledWith(apiError);
    });

    it('should handle no maps found', async () => {
      // Arrange
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        size: 50,
      });

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
          size: 50,
        };
        (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
          testMapData,
        );

        const objective = new MonsterTaskObjective(mockCharacter as any, 1);

        // Act
        const result = await objective.run();

        // Assert
        expect(result).toBe(true);
        expect(getMaps).toHaveBeenCalledWith({
          content_code: test.task,
          content_type: 'monster',
        });
        expect(mockCharacter.fightNow).toHaveBeenCalledWith(
          test.total,
          test.task,
        );

        // Reset for next test
        jest.clearAllMocks();
        (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
          testMapData,
        );
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
        size: 50,
      };
      (getMaps as jest.MockedFunction<typeof getMaps>).mockResolvedValue(
        customMapData,
      );
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
