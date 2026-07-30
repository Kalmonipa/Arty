import { actionFight } from '../api_calls/Actions.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { MinEquippedUtilities } from '../constants.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';

export class FightBossParticipantObjective extends Objective {
  target: ObjectiveTargets;
  participants: string[];

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants: string[],
    parentObjective?: string,
  ) {
    super(character, `participate_${target}_bossfight`, 'not_started');

    this.character = character;
    this.jobFlavour = 'FightBossParticipant';
    this.target = target;
    this.participants = participants;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Get prepared for the fight and move to the location of the bosss.
   * The leader will poll each of the participants and if they're on the boss map,
   * the leader will initiate the fight.
   */
  async run(): Promise<boolean> {
    if (!(await this.checkStatus())) return false;

    await this.character.evaluateGear('combat', this.target.code);

    logger.info(`Finding location of ${this.target.code}`);

    const maps = this.character.findMaps({ content_code: this.target.code });
    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${this.target.code}`);
      return false;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);

    await this.character.move(contentLocation);

    for (this.progress; this.progress < this.target.quantity; this.progress++) {
      if (!(await this.checkStatus())) return false;

      logger.info(
        `Fought ${this.progress}/${this.target.quantity} ${this.target.code}s`,
      );

      // Get all food items to deposit
      const foodItems = this.character.findFoodInInventory();
      const foodCodes = foodItems.map((food) => food.code);
      const itemsToKeep = [...foodCodes];

      await this.character.evaluateDepositItemsInBank(
        itemsToKeep,
        contentLocation,
      );

      await this.character.recoverHealth();

      // Check these after each fight in case we need to top up
      if (this.character.data.utility1_slot_quantity <= MinEquippedUtilities) {
        if (await this.character.equipUtility('restore', 'utility1')) {
          // If we moved to the bank we need to move back to the monster location
          await this.character.move(contentLocation);
        }
      }

      const response = await actionFight(
        this.character.data,
        this.participants,
      );

      if (response instanceof ApiError) {
        await this.character.handleErrors(response);
        continue;
      } else {
        if (response.data.characters) {
          const charData = response.data.characters.find(
            (char) => char.name === this.character.data.name,
          );

          this.character.data = charData;
        } else {
          logger.error('Fight response missing character data');
          return false;
        }

        await this.character.recoverHealth();

        // Check amount of food in inventory to use after battles
        if (!(await this.character.checkFoodLevels())) {
          await this.character.topUpFood(contentLocation);
        }
      }

      await this.character.saveJobQueue();
    }

    logger.debug(
      `Successfully fought ${this.target.quantity} ${this.target.code}`,
    );
    return true;
  }
}
