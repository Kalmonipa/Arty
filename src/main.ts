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
        // // Train mining
        // char.gather(50, 'copper_ore');
        // char.craft(5, 'copper_bar');
        // char.gather(50, 'copper_ore');
        // char.craft(5, 'copper_bar');
        // char.deposit(10, 'copper_bar');
        // Iron sword x2
        char.gather(60, 'iron_ore');
        char.craft(6, 'iron_bar');
        char.fight(20, 'chicken');
        char.craft(1, 'iron_sword');
        char.deposit(1, 'iron_sword');
        char.gather(60, 'iron_ore');
        char.craft(6, 'iron_bar');
        char.fight(20, 'chicken');
        char.craft(1, 'iron_sword');
        char.deposit(1, 'iron_sword');
        // Train mining
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        char.gather(80, 'iron_ore');
        char.craft(8, 'iron_bar');
        char.deposit(8, 'iron_bar');
        break;
      case 'JumpyJimmy':
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        // Fishing net x2
        char.gather(60, 'ash_wood');
        char.craft(6, 'ash_plank');
        char.craft(1, 'wooden_shield');
        char.deposit(1, 'wooden_shield');
        // Level up fishing
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        char.gather(80, 'shrimp');
        char.craft(80, 'cooked_shrimp');
        char.deposit(80, 'cooked_shrimp');
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
