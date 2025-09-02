import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';

let shouldStopActions = false;

async function main() {
  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData);

    switch (CharName) {
      case 'LongLegLarry':
        var count = 0;
        while (count < 30) {
          char.gather(100, 'red_slimeball');
          count++;
        }
        var count = 0;
        while (count < 40) {
          char.gather(80, 'blue_slimeball');
          count++;
        }
        break;
      case 'JumpyJimmy':
        var count = 0;
        while (count < 100) {
          char.gather(90, 'sunflower')
          //char.craft(30, 'small_health_potions')
          char.deposit(90, 'sunflower')
          count++;
        }
        break;
      case 'ZippyZoe':
        var count = 0;
        while (count < 100) {
          char.gather(90, 'sunflower')
          char.craft(30, 'small_health_potions')
          char.deposit(30, 'small_health_potions')
          count++;
        }
        break;
      case 'TimidTom':
        var count = 0;
        while (count < 20) {
          char.doItemsTask();
          count++;
        }
        break;
      case 'BouncyBella':
        var count = 0;
        while (count < 10) {
          char.withdraw(60, 'copper_bar');
          char.craft(10, 'copper_ring');
          char.deposit(10, 'copper_ring');
          count++;
        }
        // Level mining
        var count = 0;
        while (count < 200) {
          char.gather(80, 'iron_ore');
          //char.craftJob(8, 'iron_bar');
          char.deposit(80, 'iron_ore');
          count++;
        }
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
