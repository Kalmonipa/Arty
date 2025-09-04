import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';
import { buildListOfUsefulWeapons } from './utils';

let shouldStopActions = false;

async function main() {
  const weaponMap = await buildListOfUsefulWeapons();

  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData, weaponMap);

    switch (CharName) {
      case 'LongLegLarry':
        char.gather(200, 'red_slimeball');
        char.deposit(0, 'red_slimeball')
        //char.deposit(17000, 'gold')
        //var count = 0;
        //while (count < 4) {
        //char.fight(100, 'flying_snake');
        //  count++;
        //}
        //char.doMonsterTask();
        break;
      case 'JumpyJimmy':
        //char.gather(10, 'copper_ore')
        var count = 0;
        while (count < 15) {
        char.gather(80, 'sunflower', true);
        char.deposit(80, 'sunflower')
        // char.craft(22, 'air_boost_potion');
        // char.deposit(22, 'air_boost_potion');
        // char.craft(25, 'fire_boost_potion');
        // char.deposit(25, 'fire_boost_potion');
          count++;
        }
        break;
      case 'ZippyZoe':
        var count = 0;
        while (count < 15) {
        // char.craft(25, 'fire_boost_potion');
        // char.deposit(25, 'fire_boost_potion');
        // char.craft(25, 'fire_boost_potion');
        // char.deposit(25, 'fire_boost_potion');
        char.gather(80, 'sunflower', true);
        char.deposit(80, 'sunflower')
        //char.deposit(90, 'sunflower');
        // char.deposit(10, 'earth_boost_potion');
        // char.craft(10, 'water_boost_potion');
        // char.deposit(10, 'water_boost_potion');
        //char.craft(48, 'fire_boost_potion');
        //char.deposit(48, 'fire_boost_potion');
         count++;
        }
        break;
      case 'TimidTom':
        var count = 0;
        while (count < 5) {
          char.doItemsTask();
          count++;
        }
        break;
      case 'BouncyBella':
        var count = 0;
        while (count < 5) {
          char.gather(80, 'gudgeon');
          char.craft(80, 'cooked_gudgeon');
          char.deposit(80, 'cooked_gudgeon');
          count++;
        }
        var count = 0;
        while (count < 100) {
          char.gather(80, 'shrimp');
          char.craft(80, 'cooked_shrimp');
          char.deposit(80, 'cooked_shrimp');
          count++;
        }
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
