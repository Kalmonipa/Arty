import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';
import { buildListOfUsefulWeapons } from './utils';

let shouldStopActions = false;

export const weaponMap = buildListOfUsefulWeapons()

async function main() {

  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData);

    switch (CharName) {
      case 'LongLegLarry':
        var count = 0;
        while (count < 4) {
          char.gather(80, 'cowhide');
          count++;
        }
        var count = 0;
        while (count < 4) {
          char.gather(80, 'blue_slimeball');
          count++;
        }
        var count = 0;
        while (count < 4) {
          char.gather(80, 'wool');
          count++;
        }
        break;
      case 'JumpyJimmy':
        // var count = 0;
        // while (count < 50) {
        char.gather(90, 'sunflower', true);
        // char.craft(22, 'air_boost_potion');
        // char.deposit(22, 'air_boost_potion');
        // char.craft(25, 'fire_boost_potion');
        // char.deposit(25, 'fire_boost_potion');
        //   count++;
        // }
        break;
      case 'ZippyZoe':
        // var count = 0;
        // while (count < 50) {
        //  char.gather(90, 'sunflower');
        // char.craft(10, 'earth_boost_potion');
        // char.deposit(10, 'earth_boost_potion');
        // char.craft(10, 'water_boost_potion');
        // char.deposit(10, 'water_boost_potion');
        char.craft(48, 'fire_boost_potion');
        char.deposit(48, 'fire_boost_potion');
        //  count++;
        //}
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
