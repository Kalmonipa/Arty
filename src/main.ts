import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';
import { logger } from './utils';

let shouldStopActions = false;

async function main() {
  while (!shouldStopActions) {
    const charData = await getCharacter(CharName);
    const char = new Character(charData);
    await char.init();

    switch (CharName) {
      case 'LongLegLarry':
        char.levelGatheringSkill('fishing', 25);
        char.levelGatheringSkill('alchemy', 25);
        char.levelGatheringSkill('woodcutting', 25);
        break;
      case 'JumpyJimmy':
        char.levelGatheringSkill('fishing', 25);
        char.levelGatheringSkill('woodcutting', 25);
        break;
      case 'ZippyZoe':
        char.levelGatheringSkill('fishing', 25);
        char.levelGatheringSkill('woodcutting', 25);
        break;
      case 'TimidTom':
        char.levelGatheringSkill('woodcutting', 25);
        char.levelGatheringSkill('alchemy', 25);
        break;
      case 'BouncyBella':
        char.levelGatheringSkill('mining', 25);
        char.levelGatheringSkill('woodcutting', 25);
        break;
    }

    shouldStopActions = await char.executeJobList();
  }
}

main();
