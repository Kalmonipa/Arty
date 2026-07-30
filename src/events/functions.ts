import { Character } from '../character/characterClass.js';
import { db } from '../db.js';
import { EventRule } from '../types/Database.js';
import { isValidLevelLimit, logger } from '../utils.js';

/**
 * Gets the event rules relating to either the specific character or team wide rules
 * @param characterName The name of the calling character
 * @param eventCode The name of the event to check
 * @returns
 */
export async function checkEventRules(
  characterName: string,
  eventCode: string,
): Promise<EventRule[]> {
  const queryText = `
    SELECT id, event_code, character, skill, min_level, max_level, ignore 
    FROM event_rules 
    WHERE event_code = $1 
      AND (character IS NULL OR character = $2);
  `;

  const result = await db.query<EventRule>(queryText, [
    eventCode,
    characterName,
  ]);
  return result.rows;
}

export async function shouldDoEvent(
  character: Character,
  eventCode: string,
): Promise<boolean> {
  const charName: string = character.data.name;
  const charCombatLevel: number = character.data.level;
  const charMiningLevel: number = character.data.mining_level;
  const charWoodcuttingLevel: number = character.data.woodcutting_level;

  // The database only gives us rules that matter to THIS character or the WHOLE team
  const rules = await checkEventRules(charName, eventCode);

  for (const rule of rules) {
    if (rule.ignore) {
      return false; // Skip the event entirely
    }

    if (rule.skill === null || rule.skill === 'combat') {
      if (
        isValidLevelLimit(rule.min_level) &&
        charCombatLevel < rule.min_level
      ) {
        logger.debug(
          `${charName} combat level (${charCombatLevel}) too low for ${eventCode} (${rule.min_level})`,
        );
        return false;
      }
      if (
        isValidLevelLimit(rule.max_level) &&
        charCombatLevel > rule.max_level
      ) {
        logger.debug(
          `${charName} combat level (${charCombatLevel}) too high for ${eventCode} (${rule.max_level})`,
        );
        return false;
      }
    } else if (rule.skill === 'mining') {
      if (
        isValidLevelLimit(rule.min_level) &&
        charMiningLevel < rule.min_level
      ) {
        logger.debug(
          `${charName} mining skill level (${charMiningLevel}) too low for ${eventCode} (${rule.min_level})`,
        );
        return false;
      }
      if (
        isValidLevelLimit(rule.max_level) &&
        charMiningLevel > rule.max_level
      ) {
        logger.debug(
          `${charName} mining skill level (${charMiningLevel}) too high for ${eventCode} (${rule.max_level})`,
        );
        return false;
      }
    } else if (rule.skill === 'woodcutting') {
      if (
        isValidLevelLimit(rule.min_level) &&
        charWoodcuttingLevel < rule.min_level
      ) {
        logger.debug(
          `${charName} woodcutting skill level (${charWoodcuttingLevel}) too low for ${eventCode} (${rule.min_level})`,
        );
        return false;
      }
      if (
        isValidLevelLimit(rule.max_level) &&
        charWoodcuttingLevel > rule.max_level
      ) {
        logger.debug(
          `${charName} woodcutting skill level (${charWoodcuttingLevel}) too high for ${eventCode} (${rule.max_level})`,
        );
        return false;
      }
    }
  }

  return true;
}
