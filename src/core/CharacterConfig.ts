import { db, GlobalConfig } from '../db.js';

/**
 * Fetches the list of event codes to ignore.
 * Expects the 'value' column to be string[]
 */
export async function getIgnoreEventList(): Promise<string[]> {
    try {
        const result = await db.query<GlobalConfig>(
            "SELECT value FROM global_config WHERE key = $1",
            ['ignore_event_list']
        );

        if (result.rows.length > 0) {
            // TypeScript knows 'value' exists because of the GlobalConfig interface
            return result.rows[0].value as string[];
        }
        return [];
    } catch (err) {
        console.error('Error fetching ignore list:', err);
        return [];
    }
}