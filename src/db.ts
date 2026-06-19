import { Pool, QueryResult } from 'pg';
import { getEnv } from './utils.js';

export interface GlobalConfig {
  key: string;
  value: any;
  updated_at: Date;
}

const pool = new Pool({
  host: getEnv('DB_HOST'),
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'oliver',
  password: getEnv('DB_PASSWORD'),
  database: process.env.DB_NAME || 'arty',
  max: 10,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const db = {
  // Defaulting T to Record<string, any> gives better fallbacks
  query: <T extends Record<string, any> = Record<string, any>>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> => {
    return pool.query<T>(text, params);
  },

  testConnection: async (): Promise<boolean> => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch (err) {
      console.error('Database connection failed:', err);
      return false;
    }
  },

  pool,
};
