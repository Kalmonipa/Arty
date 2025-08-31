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
        char.equip('life_amulet', 'amulet');
        //char.fulfillMonsterTask();
        // var count = 0;
        // while (count < 30) {
        //   char.gatherJob(10, 'red_slimeball');
        //   char.depositJob(10, 'red_slimeball');
        //   count++;
        // }
        //char.equip('iron_sword', 'weapon');
        break;
      case 'JumpyJimmy':
        var count = 0;
        while (count < 3) {
          char.withdraw(70, 'spruce_wood');
          char.craft(7, 'spruce_plank');
          char.deposit(7, 'spruce_plank');
          count++;
        }
        //   char.withdrawJob(30, 'ash_wood');
        //   char.craftJob(3, 'ash_plank');
        //   char.depositJob(3, 'ash_plank');
        // // ToDo when his woodcutting is high enough
        // char.withdrawJob(60, 'spruce_wood')
        // char.craftJob(6, 'spruce_plank');
        // char.withdrawJob(3, 'red_slimeball');
        // char.withdrawJob(3, 'yellow_slimeball');
        // char.withdrawJob(3, 'green_slimeball');
        // char.withdrawJob(3, 'blue_slimeball');
        // char.craftJob(1, 'slime_shield');
        // char.depositJob(1, 'slime_shield');

        var count = 0;
        while (count < 30) {
          char.craft(80, 'cooked_trout');
          char.deposit(80, 'cooked_trout');
          count++;
        }
        break;
      case 'ZippyZoe':
        char.craft(5, 'life_amulet');
        char.equip('life_amulet', 'amulet');
        char.deposit(4, 'life_amulet');
        // var count = 0;
        // while (count < 5) {
        //   char.withdraw(60, 'copper_bar');
        //   char.craft(10, 'copper_ring');
        //   char.deposit(10, 'copper_ring');
        //   // char.gatherJob(50, 'ash_wood');
        //   // char.craftJob(5, 'ash_plank');
        //   // char.depositJob(5, 'ash_plank');
        //   count++;
        // }
        break;
      case 'TimidTom':
        var count = 0;
        while (count < 200) {
          char.gather(80, 'coal');
          //char.craftJob(8, 'iron_bar');
          char.deposit(80, 'coal');
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
