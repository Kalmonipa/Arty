import { Pool, QueryResult } from 'pg';
import { getEnv } from './utils.js';

// Define the structure of your global_config table rows
export interface GlobalConfig {
  key: string;
  value: any; // We use 'any' or a specific union type for the JSONB content
  updated_at: Date;
}

const pool = new Pool({
  host: getEnv('DB_HOST'),
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'oliver',
  password: getEnv('DB_PASSWORD'),
  database: process.env.DB_NAME || 'oliver',
  max: 10,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const db = {
  // A type-safe query wrapper
  query: <T extends any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },
  pool,
};
