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
        // Complete task
        char.fightJob(81, 'yellow_slime');
        //char.withdrawJob(1, 'copper_pickaxe');
        char.equipJob('copper_pickaxe', 'weapon');

        var count = 0;
        while (count < 100) {
          // Train weaponcrafting
          char.gatherJob(60, 'copper_ore');
          char.craftJob(6, 'copper_bar');
          char.craftJob(1, 'copper_dagger');
          char.depositJob(1, 'copper_dagger');
          count++;
        }
        // Iron sword x2
        // char.gather(60, 'iron_ore');
        // char.craft(6, 'iron_bar');
        // char.fight(20, 'chicken');
        // char.craft(1, 'iron_sword');
        // char.deposit(1, 'iron_sword');
        // char.gather(60, 'iron_ore');
        // char.craft(6, 'iron_bar');
        // char.fight(20, 'chicken');
        // char.craft(1, 'iron_sword');
        // char.deposit(1, 'iron_sword');
        break;
      case 'JumpyJimmy':
        var count = 0;
        while (count < 30) {
          // Train gearcrafting
          char.gatherJob(80, 'copper_ore');
          char.craftJob(8, 'copper_bar');
          char.craftJob(1, 'copper_boots');
          char.depositJob(1, 'copper_boots');
          count++;
        }
        var count = 0;
        while (count < 100) {
          // Level up fishing
          char.gatherJob(80, 'shrimp');
          char.craftJob(80, 'cooked_shrimp');
          char.depositJob(80, 'cooked_shrimp');
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
          char.gatherJob(80, 'copper_ore');
          char.craftJob(8, 'copper_bar');
          char.depositJob(8, 'copper_bar');
          count++;
        }
        break;
      case 'BouncyBella':
        var count = 0;
        while (count < 200) {
          char.gatherJob(80, 'copper_ore');
          char.craftJob(8, 'copper_bar');
          char.depositJob(8, 'copper_bar');
          count++;
        }
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
