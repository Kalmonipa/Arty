import * as fs from 'fs';
import path from 'path';
import { ItemSchema, MapSchema } from '../src/types/types.js';

/**
 * Rebuilds the committed test fixtures from the local game state.
 * Run `npm run pull-gamestate` first to refresh `data/`.
 *
 * Maps keep only the fields the navigation code reads, and items are trimmed to
 * consumables, which takes the pair from about 900KB to 240KB.
 */
const dataDir = path.join(process.cwd(), 'data');
const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures');

function read<T>(name: string): T {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} is missing. Run 'npm run pull-gamestate' first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

const maps = read<MapSchema[]>('maps-data.json').map((map) => ({
  map_id: map.map_id,
  name: map.name,
  x: map.x,
  y: map.y,
  layer: map.layer,
  access: map.access,
  interactions: map.interactions,
}));

const consumables = read<ItemSchema[]>('items-data.json').filter(
  (item) => item.type === 'consumable',
);

fs.writeFileSync(path.join(fixtureDir, 'maps.json'), JSON.stringify(maps));
fs.writeFileSync(
  path.join(fixtureDir, 'consumables.json'),
  JSON.stringify(consumables),
);

console.log(`Wrote ${maps.length} maps and ${consumables.length} consumables`);
