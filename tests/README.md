# Integration Tests for Arty

This directory contains integration tests for the Arty MMO bot, specifically designed to test classes like `GatherObjective` with mocked external API calls.

## Test Structure

### `/mocks/`
Contains mock implementations for external dependencies:

- **`apiMocks.ts`**: Mock implementations of API calls based on the OpenAPI specification
- **`characterMock.ts`**: Mock implementation of the Character class with all necessary methods

### `/integration/`
Contains integration test files:

- **`GatherObjective.test.ts`**: Comprehensive integration tests for the GatherObjective class

## Test Features

### API Mocking
All external API calls are mocked based on the OpenAPI specification at `https://api-test.artifactsmmo.com/docs/#/`:

- `actionGather`: Mock gathering actions
- `getItemInformation`: Mock item data retrieval
- `getMaps`: Mock map data retrieval
- `getAllMonsterInformation`: Mock monster data retrieval
- `getResourceInformation`: Mock resource data retrieval

### Character Mocking
The Character class is mocked with all methods used by GatherObjective:

- Inventory and bank management
- Movement and combat
- Equipment evaluation
- Error handling

### Test Coverage
The integration tests cover:

1. **Basic gathering scenarios**:
   - Items already in inventory
   - Withdrawing from bank
   - Gathering remaining quantities

2. **Different item types**:
   - Regular resources
   - Mob drops
   - Task items
   - Craftable items

3. **Error handling**:
   - API errors
   - Network failures
   - Invalid responses
   - Retry logic

4. **Edge cases**:
   - Inventory space management
   - Weapon evaluation
   - Cancellation handling
   - Invalid data structures

## Running Tests

```bash
# Install dependencies (if not already done)
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Configuration

The tests use Jest with TypeScript support and ES modules. Configuration is in `jest.config.js`:

- ES module support
- TypeScript compilation
- 30-second timeout for integration tests
- Coverage reporting
- Mock setup

## Adding New Tests

To add tests for other objective classes:

1. Create mock data in `/mocks/apiMocks.ts` if needed
2. Update `/mocks/characterMock.ts` with new Character methods
3. Create a new test file in `/integration/`
4. Follow the same pattern of mocking external dependencies

## Mock Data

Mock data is based on the OpenAPI specification and includes:

- Character data with realistic stats
- Item data with proper schemas
- Map data with coordinates
- Monster data with drops
- API response schemas

All mock data follows the TypeScript interfaces defined in `/src/types/`.
