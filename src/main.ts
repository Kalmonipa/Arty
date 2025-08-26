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
        char.fightJob(133, 'blue_slime')
        // var count = 0;
        // while (count < 30) {
        //   // Train weaponcrafting
        //   char.gatherJob(2, 'feather');
        //   char.withdrawJob(6, 'iron_bar');
        //   char.craftJob(1, 'iron_sword');
        //   char.depositJob(1, 'iron_sword');
        //   count++;
        // }
        break;
      case 'JumpyJimmy':
        var count = 0;
        while (count < 20) {
          // Train gearcrafting
          char.gatherJob(2, 'feather');
          char.withdrawJob(5, 'copper_bar');
          char.craftJob(1, 'copper_legs_armor');
          char.depositJob(1, 'copper_legs_armor');
          count++;
        }
        break;
      case 'ZippyZoe':
        var count = 0;
        while (count < 100) {
          char.gatherJob(84, 'sunflower');
          char.craftJob(28, 'small_health_potion');
          char.depositJob(28, 'small_health_potion');
          count++;
        }
        break;
      case 'TimidTom':
        var count = 0;
        while (count < 200) {
          char.gatherJob(80, 'coal');
          //char.craftJob(8, 'iron_bar');
          char.depositJob(80, 'coal');
          count++;
        }
        break;
      case 'BouncyBella':
        var count = 0;
        while (count < 200) {
          char.gatherJob(80, 'iron_ore');
          //char.craftJob(8, 'iron_bar');
          char.depositJob(80, 'iron_ore');
          count++;
        }
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
