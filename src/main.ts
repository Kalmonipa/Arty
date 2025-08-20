import { getEnv, logger } from './utils';
import { beAlchemist } from './roles/alchemist';
import { beFisherman } from './roles/fisherman';
import { beFighter } from './roles/fighter';
import { beLumberjack } from './roles/lumberjack';
import { beMiner } from './roles/miner';
import { beTaskmaster } from './roles/taskmaster';
import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';

let shouldStopActions = false;

async function main() {
  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData);

    char.gather(60, 'copper_ore');
    char.craft(6, 'copper_bar');
    char.craft(2, 'copper_dagger');

    //await char.move({ x: 5, y: 2 });
    //shouldStopActions = await char.fight(3, "chicken");
    // shouldStopActions = await char.deposit(2, "golden_egg");
    // shouldStopActions = await char.deposit(29, "feather");
    // shouldStopActions = await char.deposit(3, "tasks_coin");
    shouldStopActions = await char.executeJobList();
  }
}

main();
