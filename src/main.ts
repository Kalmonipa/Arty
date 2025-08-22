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
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_ring');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_ring');
        char.equip('copper_ring', 'ring1');
        char.equip('copper_ring', 'ring2');
        // Train weaponcrafting
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_dagger');
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
        // Train mining
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        // char.gather(80, 'iron_ore');
        // char.craft(8, 'iron_bar');
        // char.deposit(8, 'iron_bar');
        break;
      case 'JumpyJimmy':
        var count = 0;
        while (count < 30) {
          // Train gearcrafting
          char.gather(80, 'copper_ore');
          char.craft(8, 'copper_bar');
          char.craft(1, 'copper_boots');
          char.deposit(1, 'copper_boots');
          count++;
        }
        var count = 0;
        while (count < 100) {
          // Level up fishing
          char.gather(80, 'shrimp');
          char.craft(80, 'cooked_shrimp');
          char.deposit(80, 'cooked_shrimp');
          count++;
        }
        break;
      case 'ZippyZoe':
        var count = 0;
        while (count < 100) {
          char.gather(80, 'sunflower');
          char.deposit(80, 'sunflower');
          count++;
        }
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
