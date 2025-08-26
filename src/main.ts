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
          char.gatherJob(10, 'red_slimeball');
          char.depositJob(10, 'red_slimeball');
          //   // Train weaponcrafting
          //   char.gatherJob(2, 'feather');
          //   char.withdrawJob(6, 'iron_bar');
          //   char.craftJob(1, 'iron_sword');
          //   char.depositJob(1, 'iron_sword');
          count++;
        }
        break;
      case 'JumpyJimmy':
        char.craftJob(1, 'copper_armor');
        char.craftJob(1, 'copper_armor');
        char.craftJob(1, 'copper_armor');
        char.craftJob(1, 'copper_armor');
        char.craftJob(1, 'copper_armor');
        char.craftJob(1, 'copper_armor');
        var count = 0;
        while (count < 5) {
          // Train gearcrafting
          char.gatherJob(80, 'shrimp');
          char.craftJob(80, 'cooked_shrimp');
          char.depositJob(80, 'cooked_shrimp');
          count++;
        }
        var count = 0;
        while (count < 10) {
          // Train gearcrafting
          char.gatherJob(80, 'trout');
          char.craftJob(80, 'cooked_trout');
          char.depositJob(80, 'cooked_trout');
          count++;
        }
        break;
      case 'ZippyZoe':
        var count = 0;
        while (count < 4) {
          char.withdrawJob(10, 'red_slimeball');
          char.withdrawJob(10, 'sunflower');
          char.withdrawJob(10, 'algae');
          char.craftJob(10, 'fire_boost_potion');
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
