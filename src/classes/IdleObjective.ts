import { Role } from '../types/CharacterData.js';
import { Skill } from '../types/types.js';
import { isGatheringSkill } from '../utils.js';
import { Character } from './Character.js';
import { ItemTaskObjective } from './ItemTaskObjective.js';
import { MonsterTaskObjective } from './MonsterTaskObjective.js';
import { Objective } from './Objective.js';
import { TidyBankObjective } from './TidyBankObjective.js';
import { TrainCraftingSkillObjective } from './TrainCraftingSkillObjective.js';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjective.js';

export class IdleObjective extends Objective {
  role: Role;

  constructor(character: Character, role: Role) {
    super(character, `idle_objective_${role}`, 'not_started');

    this.character = character;
    this.role = role;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Picks a random idle task from the list
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    const idleObjectives = ['cleanUpBank', 'topUpBank', 'doTask', 'trainSkill'];

    const randomObjective =
      idleObjectives[Math.floor(Math.random() * idleObjectives.length)];

    switch (randomObjective) {
      case 'cleanUpBank':
        return await this.cleanUpBank();
      case 'topUpBank':
        return await this.topUpBank();
      case 'doTask':
        if (this.role === 'fighter') {
          return await this.doMonsterTask();
        } else {
          return await this.doItemTask();
        }
      case 'trainSkill':
        // ToDo: Add in gearcrafting and jewelrycrafting. Maybe use sub-roles for those?
        switch (this.role) {
          case 'alchemist':
            return await this.trainSkill('alchemy');

          case 'fighter':
            return await this.trainSkill('weaponcrafting');

          case 'fisherman':
            return await this.trainSkill('fishing');

          case 'lumberjack':
            return await this.trainSkill('woodcutting');

          case 'miner':
            return await this.trainSkill('mining');
        }
    }
  }

  /**
   * Craft certain items and recycle items depending on role
   * @returns true if successful, false if not
   */
  private async cleanUpBank(): Promise<boolean> {
    const job = new TidyBankObjective(this.character);
    return this.character.executeJobNow(job, true, true, this.objectiveId);
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   * - 1k Health potions of varying levels
   * - 1k Food of varying levels
   * - x Task coins (maybe?)
   */
  private async topUpBank(): Promise<boolean> {
    return true;
  }

  /**
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doItemTask(): Promise<boolean> {
    return this.character.executeJobNow(
      new ItemTaskObjective(this.character, 1),
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Completes an item task
   * @returns true if successful, false if not
   */
  private async doMonsterTask(): Promise<boolean> {
    return this.character.executeJobNow(
      new MonsterTaskObjective(this.character, 1),
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * Increase the level of a skill by 1
   * @todo Change this so that it only gets a set amount of an item at a time so that the idle task doesn't take a long time.
   *        I would like to have characters check for events and prioritise events over leveling skills so if we spend ~5 hours
   *        leveling a skill then we might miss some important events
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill: Skill): Promise<boolean> {
    let job: Objective;

    if (isGatheringSkill(skill)) {
      job = new TrainGatheringSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(skill) + 1,
      );
    } else {
      job = new TrainCraftingSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(skill) + 1,
      );
    }
    return this.character.executeJobNow(job, true, true, this.objectiveId);
  }
}
