import { actionFight } from '../api_calls/Actions.js';
import { logger } from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import { getMonsterInformation } from '../api_calls/Monsters.js';
import { MinEquippedUtilities } from '../constants.js';

export class FightBossParticipantObjective extends Objective {
  target: ObjectiveTargets;
  participants?: string[];
  runFightSim?: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    participants?: string[],
  ) {
    super(
      character,
      `participate_bossfight_${target.quantity}_${target.code}`,
      'not_started',
    );

    this.character = character;
    this.jobFlavour = 'FightBossParticipant';
    this.target = target;
    this.participants = participants;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    // Get all food items to deposit
    const foodItems = this.character.findFoodInInventory();
    const foodCodes = foodItems.map((food) => food.code);
    const itemsToKeep = [...foodCodes];

    await this.character.evaluateDepositItemsInBank(itemsToKeep);

    await this.character.evaluateGear('combat', this.target.code);

    const mobInfo = await getMonsterInformation(this.target.code);
    if (mobInfo instanceof ApiError) {
      await this.character.handleErrors(mobInfo);
      return ObjectiveFailed;
    }

    return ObjectiveCompleted;
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async run(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }
}
