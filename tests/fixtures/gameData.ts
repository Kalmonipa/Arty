import * as fs from 'fs';
import { ItemSchema, MapSchema } from '../../src/types/types.js';

/**
 * Snapshots of the real game data, committed so tests that assert against the
 * actual world run anywhere.
 *
 * `data/` is gitignored and populated by `npm run pull-gamestate`, so it exists
 * only on machines that have run the app — tests reading it pass locally and
 * fail in CI. Regenerating the live API in CI instead would put a network fetch
 * (and a slice of the shared data rate limit) in front of every build.
 *
 * Refresh with `npm run update-test-fixtures` after a `pull-gamestate`. Maps
 * carry only the fields the navigation code reads; items are trimmed to
 * consumables. If the game's world changes, these tests are meant to fail — that
 * is the signal that an assumption moved.
 *
 * Paths are relative to the repo root, which is where jest runs.
 */
export function loadMaps(): MapSchema[] {
  return JSON.parse(fs.readFileSync('tests/fixtures/maps.json', 'utf-8'));
}

export function loadConsumables(): ItemSchema[] {
  return JSON.parse(
    fs.readFileSync('tests/fixtures/consumables.json', 'utf-8'),
  );
}
