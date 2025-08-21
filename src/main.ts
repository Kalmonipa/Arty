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
        // Copper pisckaxe
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_pickaxe');
        char.deposit(1, 'copper_pickaxe');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_pickaxe');
        char.deposit(1, 'copper_pickaxe');
        // Copper axe x2
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_axe');
        char.deposit(1, 'copper_axe');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_axe');
        char.deposit(1, 'copper_axe');
        // Copper armor x2
        char.gather(50, 'copper_ore');
        char.craft(5, 'copper_bar');
        char.gather(50, 'copper_ore');
        char.craft(5, 'copper_bar');
        char.deposit(10, 'copper_bar');
        break;
      case 'JumpyJimmy':
        // Fishing net x2
        char.gather(60, 'ash_wood');
        char.craft(6, 'ash_plank');
        char.craft(1, 'fishing_net');
        char.deposit(1, 'fishing_net');
        char.gather(60, 'ash_wood');
        char.craft(6, 'ash_plank');
        char.craft(1, 'fishing_net');
        char.deposit(1, 'fishing_net');
        // Copper helmet x2
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_helmet');
        char.deposit(1, 'copper_helmet');
        char.gather(60, 'copper_ore');
        char.craft(6, 'copper_bar');
        char.craft(1, 'copper_helmet');
        char.deposit(1, 'copper_helmet');
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
