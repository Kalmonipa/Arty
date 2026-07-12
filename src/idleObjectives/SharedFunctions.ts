import { Character } from '../character/characterClass.js';
import { Role } from '../types/CharacterData.js';
import { logger } from '../utils.js';

/**
 * @description We can't trade with the Tasks Master until the tasks_farmer achievement is complete
 * This function will ensure that we prioritise doing tasks to get it.
 */
export async function completeTasksFarmerAchievement(
  character: Character,
  role: Role,
) {
  if (
    character.completedAchievements.find(
      (achievement) => achievement.code === 'tasks_farmer',
    )
  ) {
    return true;
  } else {
    logger.debug(
      `tasks_farmer achievement not completed. Doing tasks to contribute`,
    );

    if (
      role === 'crafter' ||
      role === 'gearcrafter' ||
      role === 'jewelrycrafter' ||
      role === 'weaponcrafter'
    ) {
      await character.doMonsterTask(2);
    } else {
      await character.doItemsTask(2);
    }
  }
  return true;
}
