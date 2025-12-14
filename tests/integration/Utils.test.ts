import { TransitionLocations } from '../../src/utils.js';
import { getMaps } from '../../src/api_calls/Maps.js';
import { MapSchema } from '../../src/types/types.js';
import { ApiError } from '../../src/core/Error.js';

jest.mock('../../src/api_calls/Maps.js', () => ({
  getMaps: jest.fn(),
  getMapsById: jest.fn(),
}));

// Cast the mocked function for correct typing
const mockedGetMaps = getMaps as jest.Mock;

describe('TransitionLocations', () => {
  // Define a minimal TransitionSchema object
  const mockTransition = { target_map_id: 2, target_x: 5, target_y: 5 };

  // --- Mock Data ---

  const mockMapWithTransition: MapSchema = {
    map_id: 571,
    name: 'Mountain',
    skin: 'mountain_6',
    x: -2,
    y: 6,
    layer: 'overworld',
    access: {
      type: 'standard',
      conditions: [],
    },
    interactions: {
      content: null,
      transition: {
        map_id: 572,
        x: -2,
        y: 6,
        layer: 'underground',
        conditions: [],
      },
    },
  };

  const mockMapWithoutTransition: MapSchema = {
        map_id: 1285,
        name: 'Sandwhisper Isle',
        skin: 'desertisland_15',
        x: -2,
        y: 20,
        layer: 'overworld',
        access: {
          type: 'standard',
          conditions: [],
        },
        interactions: {
          content: null,
          transition: null,
        },
  };

  const mockMaps = [
    mockMapWithTransition,
    mockMapWithoutTransition,
  ];

  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    jest.clearAllMocks();
  });

  // --- Test Cases ---

  test('should correctly filter maps with an existing transition property', async () => {
    // Arrange: Mock the API to return the mixed list of maps
    mockedGetMaps.mockResolvedValue({ data: mockMaps });

    // Act
    const result = await TransitionLocations();

    // Assert
    expect(mockedGetMaps).toHaveBeenCalled();
    // Only 'Map A' should be in the result
    expect(result).toHaveLength(1);
    expect(result[0].map_id).toBe(571);
    expect(result[0].name).toBe('Mountain');
    // Ensure the other maps were filtered out
    expect(result).not.toContainEqual(mockMapWithoutTransition);
  });

  test('should return an empty array if no maps have a transition property', async () => {
    // Arrange: Mock the API to return only maps without transitions
    const noTransitionMaps = [mockMapWithoutTransition];
    mockedGetMaps.mockResolvedValue({ data: noTransitionMaps });

    // Act
    const result = await TransitionLocations();

    // Assert
    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });
});