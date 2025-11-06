// Test setup file
import { jest } from '@jest/globals';

// Mock winston logger to prevent console output during tests
jest.mock('winston', () => ({
  createLogger: jest.fn(() => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn((meta) => mockLogger), // Return self for child logger
    };
    return mockLogger;
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn(),
    errors: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

// Mock fs/promises to prevent file system operations during tests
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
}));

// Set up global test timeout
jest.setTimeout(30000);
