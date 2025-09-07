import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';

let shouldStopActions = false;

async function main() {
  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData);
    await char.init();

    switch (CharName) {
      case 'LongLegLarry':
        char.fight(1, 'chicken');
        // char.deposit(0, 'red_slimeball')
        //char.deposit(17000, 'gold')
        //var count = 0;
        //while (count < 4) {
        //char.fight(100, 'flying_snake');
        //  count++;
        //}
        //char.doMonsterTask();
        break;
      case 'JumpyJimmy':
        char.gather(4, 'red_slimeball');
        // var count = 0;
        // while (count < 48) {
        //   char.gather(200, 'red_slimeball');
        //   // char.gather(80, 'sunflower', true);
        //   // char.deposit(80, 'sunflower')
        //   // char.craft(22, 'air_boost_potion');
        //   // char.deposit(22, 'air_boost_potion');
        //   // char.craft(25, 'fire_boost_potion');
        //   // char.deposit(25, 'fire_boost_potion');
        //   count++;
        // }
        break;
      case 'ZippyZoe':
        // var count = 0;
        // while (count < 15) {
        char.craft(1, 'fire_and_earth_amulet');
        char.deposit(1, 'fire_and_earth_amulet');
        // char.craft(25, 'fire_boost_potion');
        // char.deposit(25, 'fire_boost_potion');
        // char.gather(80, 'sunflower', true);
        // char.deposit(80, 'sunflower')
        //char.deposit(90, 'sunflower');
        // char.deposit(10, 'earth_boost_potion');
        // char.craft(10, 'water_boost_potion');
        // char.deposit(10, 'water_boost_potion');
        //char.craft(48, 'fire_boost_potion');
        //   //char.deposit(48, 'fire_boost_potion');
        //   count++;
        // }
        break;
      case 'TimidTom':
        var count = 0;
        while (count < 20) {
          char.doItemsTask();
          count++;
        }
        break;
      case 'BouncyBella':
        char.levelFishingTo(25);
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
