import { Character } from '../character/characterClass.js';
import { Role } from '../types/CharacterData.js';
import { GetCharacterData, getHighestCharLevel, logger } from '../utils.js';

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

/**
 * The aim of this function is to keep all characters within 10 level of the highest level char
 * This lets us recycle older gear so that it doesn't clog up the bank
 */
export async function checkWithinLevelRange(): Promise<boolean> {
  const allCharacterDetails = await GetCharacterData();
  this.character.highestCharLevel = getHighestCharLevel(allCharacterDetails);

  if (this.character.data.level < this.character.highestCharLevel - 10) {
    logger.info(
      `Character level (${this.character.data.level}) is more than 10 levels behind the leader (${this.character.highestCharLevel}). Training ${this.character.highestCharLevel - this.character.data.level} levels`,
    );
    return await this.character.trainCombatLevelNow(
      this.character.highestCharLevel - 10,
    );
  }

  return true;
}
