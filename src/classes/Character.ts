import {
  actionDepositItems,
  actionMove,
  actionRest,
} from '../api_calls/Actions.js';
import { actionUse, getItemInformation } from '../api_calls/Items.js';
import { getMaps } from '../api_calls/Maps.js';
import { HealthStatus, Role } from '../types/CharacterData.js';
import {
  CharacterSchema,
  CraftSkill,
  DestinationSchema,
  GatheringSkill,
  ItemSchema,
  ItemSlot,
  MapSchema,
  MonsterSchema,
  SimpleItemSchema,
  Skill,
} from '../types/types.js';
import {
  buildListOf,
  buildListOfWeapons,
  CharRole,
  logger,
  sleep,
} from '../utils.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CraftObjective } from './CraftObjective.js';
import { DepositObjective } from './DepositObjective.js';
import { ApiError } from './Error.js';
import { GatherObjective } from './GatherObjective.js';
import { Objective } from './Objective.js';
import {
  ObjectiveTargets,
  ObjectiveStatus,
  SerializedJob,
} from '../types/ObjectiveData.js';
import { FightObjective } from './FightObjective.js';
import { EquipObjective } from './EquipObjective.js';
import { UnequipObjective } from './UnequipObjective.js';
import { WithdrawObjective } from './WithdrawObjective.js';
import { MonsterTaskObjective } from './MonsterTaskObjective.js';
import { getBankItems } from '../api_calls/Bank.js';
import { ItemTaskObjective } from './ItemTaskObjective.js';
import {
  UtilityEffects,
  WeaponFlavours,
  GearEffects,
  ConsumableEffects,
} from '../types/ItemData.js';
import { SimpleMapSchema } from '../types/MapData.js';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjective.js';
import { TidyBankObjective } from './TidyBankObjective.js';
import { EvaluateGearObjective } from './EvaluateGearObjective.js';
import { TradeObjective } from './TradeWithNPCObjective.js';
import { TradeType } from '../types/NPCData.js';
import { FightSimulator } from './FightSimulator.js';
import { IdleObjective } from './IdleObjective.js';
import { TrainCraftingSkillObjective } from './TrainCraftingSkillObjective.js';
import { TrainCombatObjective } from './TrainCombatObjective.js';
import { RecycleObjective } from './RecycleObjective.js';

export class Character {
  data: CharacterSchema;

  /**
   * The current active job. We only ever execute this job
   */
  activeJob?: Objective;
  /**
   * The list of jobs that have not been started yet
   */
  jobList: Objective[] = [];
  /**
   * The currently executing job (for tracking parent-child relationships)
   */
  currentExecutingJob?: Objective;

  /**
   * Path to the job queue persistence file
   */
  private jobQueueFilePath: string;

  /**
   * Game state that we can refer to without API calls
   */
  amuletMap?: Record<GearEffects, ItemSchema[]>;
  armorMap?: Record<GearEffects, ItemSchema[]>;
  bootsMap?: Record<GearEffects, ItemSchema[]>;
  helmetMap?: Record<GearEffects, ItemSchema[]>;
  legsArmorMap?: Record<GearEffects, ItemSchema[]>;
  ringsMap?: Record<GearEffects, ItemSchema[]>;
  shieldMap?: Record<GearEffects, ItemSchema[]>;

  consumablesMap?: Record<ConsumableEffects, ItemSchema[]>;
  utilitiesMap?: Record<UtilityEffects, ItemSchema[]>;
  // ToDo: build a map of gathering weapons and a map of combat weapons
  weaponMap?: Record<WeaponFlavours, ItemSchema[]>;

  /**
   * True when character is not doing anything
   * To be used when we implement idle tasks
   */
  isIdle: boolean = true;
  /**
   * Max default number of slots. Can be increased with a backpack
   */
  maxInventorySlots = 20;
  /**
   * Maximum number of potions that can be equipped
   */
  maxEquippedUtilities = 100;
  /**
   * Minimum number of potions to equip
   */
  minEquippedUtilities = 20;
  /**
   * The code of the food we're currently using. Saving it as a var so
   * I don't have to search my inv to figure out what to use
   */
  preferredFood: string;
  /**
   * Desired number of food in inventory
   */
  desiredFoodCount = 50;
  /**
   *  Minimum food in inventory when going into a fight
   */
  minFood = 15;
  /**
   * List of items to keep when doing a deposit all
   */
  itemsToKeep: string[] = [];
  /**
   * Role of the character. One of Alchemist, Fighter, Fisherman, Lumberjack, Miner
   */
  role: Role;

  constructor(data: CharacterSchema) {
    this.data = data;
    this.jobQueueFilePath = path.join(
      process.cwd(),
      'data',
      `job_queue_${data.name}.json`,
    );
  }

  /**
   * @description function that builds some data sets to use later on
   */
  async init() {
    this.armorMap = await buildListOf('body_armor');
    this.amuletMap = await buildListOf('amulet');
    this.bootsMap = await buildListOf('boots');
    this.helmetMap = await buildListOf('helmet');
    this.legsArmorMap = await buildListOf('leg_armor');
    this.ringsMap = await buildListOf('ring');
    this.shieldMap = await buildListOf('shield');
    this.consumablesMap = await buildListOf('consumable');
    this.utilitiesMap = await buildListOf('utility');
    this.weaponMap = await buildListOfWeapons();

    this.role = CharRole;

    await this.loadJobQueue();
  }

  /********
   * Job functions
   ********/

  /**
   * @description Lists the names of all the objectivs in the queue
   */
  listObjectives(): string[] {
    const objNames: string[] = [];
    for (const obj of this.jobList) {
      objNames.push(obj.objectiveId);
    }
    return objNames;
  }

  /**
   * @description Lists all objectives with their parent-child relationships
   */
  listObjectivesWithParents(): Array<{
    id: string;
    parentId?: string;
    childId?: string;
    status: string;
  }> {
    const objectives = [];
    for (const obj of this.jobList) {
      objectives.push({
        id: obj.objectiveId,
        parentId: obj.parentId,
        childId: obj.childId,
        status: obj.status,
      });
    }
    return objectives;
  }

  /**
   * @description Gets the complete job chain starting from a root job
   * @param rootJobId The objectiveId of the root job to start the chain from
   * @returns Array of job IDs in the chain order
   */
  getJobChain(rootJobId: string): string[] {
    const chain = [rootJobId];

    // Find the job in the current jobList or currentExecutingJob
    let currentJob = this.jobList.find((job) => job.objectiveId === rootJobId);
    if (
      !currentJob &&
      this.currentExecutingJob &&
      this.currentExecutingJob.objectiveId === rootJobId
    ) {
      currentJob = this.currentExecutingJob;
    }

    // Follow the child chain
    while (currentJob && currentJob.childId) {
      chain.push(currentJob.childId);
      currentJob = this.jobList.find(
        (job) => job.objectiveId === currentJob.childId,
      );
      if (
        !currentJob &&
        this.currentExecutingJob &&
        this.currentExecutingJob.objectiveId === currentJob.childId
      ) {
        currentJob = this.currentExecutingJob;
      }
    }

    return chain;
  }

  /**
   * @description Gets all cancelled jobs in the queue
   * @returns Array of cancelled job IDs
   */
  getCancelledJobs(): string[] {
    return this.jobList
      .filter((job) => job.status === 'cancelled')
      .map((job) => job.objectiveId);
  }

  /**
   * @description Saves the current job queue to a file
   */
  async saveJobQueue(): Promise<void> {
    try {
      const dataDir = path.dirname(this.jobQueueFilePath);
      await fs.mkdir(dataDir, { recursive: true });

      const jobQueueData = {
        characterName: this.data.name,
        timestamp: new Date().toISOString(),
        jobs: this.jobList.map((job) => this.serializeJob(job)),
      };

      await fs.writeFile(
        this.jobQueueFilePath,
        JSON.stringify(jobQueueData, null, 2),
      );
      logger.debug(
        `Saved ${this.jobList.length} jobs to ${this.jobQueueFilePath}`,
      );
    } catch (error) {
      logger.error(`Failed to save job queue: ${error.message}`);
    }
  }

  /**
   * @description Loads the job queue from a file
   */
  async loadJobQueue(): Promise<void> {
    try {
      const fileContent = await fs.readFile(this.jobQueueFilePath, 'utf-8');
      const jobQueueData = JSON.parse(fileContent);

      // Clear current job list
      this.jobList = [];

      // Deserialize and add jobs
      for (const jobData of jobQueueData.jobs) {
        const job = this.deserializeJob(jobData);
        if (job) {
          this.jobList.push(job);
        }
      }

      logger.info(
        `Loaded ${this.jobList.length} jobs from ${this.jobQueueFilePath}`,
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(`No saved job queue found for ${this.data.name}`);
      } else {
        logger.error(`Failed to load job queue: ${error.message}`);
      }
    }
  }

  /**
   * @description Serializes a job to a plain object for persistence
   */
  private serializeJob(job: Objective): SerializedJob {
    return {
      type: job.constructor.name,
      objectiveId: job.objectiveId,
      status: job.status,
      progress: job.progress,
      parentId: job.parentId,
      childId: job.childId,
      maxRetries: job.maxRetries,
      // Add type-specific data
      ...this.getJobSpecificData(job),
    };
  }

  /**
   * @description Gets type-specific data for job serialization
   */
  private getJobSpecificData(job: Objective): Record<string, unknown> {
    if (job instanceof CraftObjective) {
      return { target: job.target };
    } else if (job instanceof EvaluateGearObjective) {
      return {
        activityType: job.activityType,
        targetMob: job.targetMob,
      };
    } else if (job instanceof GatherObjective) {
      return {
        target: job.target,
        checkBank: job.checkBank,
        includeInventory: job.includeInventory,
      };
    } else if (job instanceof FightObjective) {
      return { target: job.target };
    } else if (job instanceof DepositObjective) {
      return { target: job.target };
    } else if (job instanceof WithdrawObjective) {
      return { target: job.target };
    } else if (job instanceof EquipObjective) {
      return {
        itemCode: job.itemCode,
        itemSlot: job.itemSlot,
        quantity: job.quantity,
      };
    } else if (job instanceof UnequipObjective) {
      return { itemSlot: job.itemSlot, quantity: job.quantity };
    } else if (job instanceof ItemTaskObjective) {
      return { quantity: job.quantity };
    } else if (job instanceof MonsterTaskObjective) {
      return {};
    } else if (job instanceof TrainCombatObjective) {
      return { targetLevel: job.targetLevel };
    } else if (job instanceof TrainCraftingSkillObjective) {
      return { skill: job.skill, targetLevel: job.targetLevel };
    } else if (job instanceof TrainGatheringSkillObjective) {
      return { skill: job.skill, targetLevel: job.targetLevel };
    } else if (job instanceof TidyBankObjective) {
      return {};
    } else if (job instanceof IdleObjective) {
      return { role: job.role };
    }
    return {};
  }

  /**
   * @description Deserializes a job from a plain object
   */
  private deserializeJob(jobData: SerializedJob): Objective | null {
    try {
      const {
        type,
        objectiveId,
        status,
        progress,
        parentId,
        childId,
        maxRetries,
        ...specificData
      } = jobData;

      let job: Objective;

      switch (type) {
        case 'CraftObjective':
          job = new CraftObjective(
            this,
            specificData.target as ObjectiveTargets,
          );
          break;
        case 'EvaluateGearObjective':
          job = new EvaluateGearObjective(
            this,
            specificData.activityType as WeaponFlavours,
            specificData.targetMob as string,
          );
          break;
        case 'GatherObjective':
          job = new GatherObjective(
            this,
            specificData.target as ObjectiveTargets,
            specificData.checkBank as boolean,
            specificData.includeInventory as boolean,
          );
          break;
        case 'FightObjective':
          job = new FightObjective(
            this,
            specificData.target as ObjectiveTargets,
          );
          break;
        case 'DepositObjective':
          job = new DepositObjective(
            this,
            specificData.target as ObjectiveTargets,
          );
          break;
        case 'WithdrawObjective':
          job = new WithdrawObjective(
            this,
            specificData.target as ObjectiveTargets,
          );
          break;
        case 'EquipObjective':
          job = new EquipObjective(
            this,
            specificData.itemCode as string,
            specificData.itemSlot as ItemSlot,
            specificData.quantity as number,
          );
          break;
        case 'UnequipObjective':
          job = new UnequipObjective(
            this,
            specificData.itemSlot as ItemSlot,
            specificData.quantity as number,
          );
          break;
        case 'ItemTaskObjective':
          job = new ItemTaskObjective(this, specificData.quantity as number);
          break;
        case 'MonsterTaskObjective':
          job = new MonsterTaskObjective(this, specificData.quantity as number);
          break;
        case 'TrainCombatObjective':
          job = new TrainCombatObjective(
            this,
            specificData.targetLevel as number,
          );
          break;
        case 'TrainCraftingSkillObjective':
          job = new TrainCraftingSkillObjective(
            this,
            specificData.skill as CraftSkill,
            specificData.targetLevel as number,
          );
          break;
        case 'TrainGatheringSkillObjective':
          job = new TrainGatheringSkillObjective(
            this,
            specificData.skill as GatheringSkill,
            specificData.targetLevel as number,
          );
          break;
        case 'TidyBankObjective':
          job = new TidyBankObjective(this, this.role);
          break;
        case 'IdleObjective':
          job = new IdleObjective(this, specificData.role as Role);
          break;
        default:
          logger.warn(`Unknown job type: ${type}`);
          return null;
      }

      // Restore job properties
      job.objectiveId = objectiveId;
      job.status = status as ObjectiveStatus;
      job.progress = progress;
      job.parentId = parentId;
      job.childId = childId;
      job.maxRetries = maxRetries;

      return job;
    } catch (error) {
      logger.error(`Failed to deserialize job: ${error.message}`);
      return null;
    }
  }

  /**
   * Adds an objective to the end of the job list
   * @param obj
   */
  async appendJob(obj: Objective) {
    this.jobList.push(obj);
    logger.info(
      `Added ${obj.objectiveId} to position ${this.jobList.length} in job list`,
    );
    await this.saveJobQueue();
  }

  /**
   * Adds an objective to the beginning of the job list
   */
  async prependJob(obj: Objective) {
    this.jobList.unshift(obj);
    await this.saveJobQueue();
  }

  /**
   * Inserts an objective into the specified position in the array
   */
  async insertJob(obj: Objective, index: number) {
    this.jobList.splice(index, 0, obj);
    logger.info(`Inserted ${obj.objectiveId} into position ${index}`);
    await this.saveJobQueue();
  }

  /**
   * Adds a job to the jobList and executes it immediately
   * This ensures all jobs go through the jobList system for tracking
   * @param obj The objective to add and execute
   * @param prepend If true, adds to beginning of jobList, otherwise adds to end. Defaults to true
   * @param trackInQueue If true, adds to jobList for tracking. If false, executes without queue tracking. Defaults to true
   * @param parentId The objectiveId of the parent job that spawned this job
   * @returns Promise<boolean> The result of the job execution
   */
  async executeJobNow(
    obj: Objective,
    prepend: boolean = true,
    trackInQueue: boolean = true,
    parentId?: string,
  ): Promise<boolean> {
    // Set the parentId if provided
    if (parentId) {
      obj.parentId = parentId;
      logger.debug(`Set parentId ${parentId} for job ${obj.objectiveId}`);
    }

    if (trackInQueue) {
      if (prepend) {
        this.prependJob(obj);
      } else {
        this.appendJob(obj);
      }

      logger.info(
        `Added job ${obj.objectiveId} to position ${prepend ? 0 : this.jobList.length - 1}${parentId ? `, parent: ${parentId}` : ''}`,
      );

      // Set this job as the currently executing job during its execution
      const previousExecutingJob = this.currentExecutingJob;
      this.currentExecutingJob = obj;

      const result = await obj.execute();

      // Restore the previous executing job
      this.currentExecutingJob = previousExecutingJob;

      await this.removeJob(obj.objectiveId);

      return result;
    } else {
      logger.info(
        `Executing sub-job ${obj.objectiveId} without queue tracking${parentId ? `, parent: ${parentId}` : ''}`,
      );

      // Set this job as the currently executing job during its execution
      const previousExecutingJob = this.currentExecutingJob;
      this.currentExecutingJob = obj;

      const result = await obj.execute();

      // Restore the previous executing job
      this.currentExecutingJob = previousExecutingJob;

      return result;
    }
  }

  /**
   * Remove job from jobList
   */
  async removeJob(objectiveId: string): Promise<boolean> {
    const ind = this.jobList.indexOf(
      this.jobList.find((obj) => objectiveId === obj.objectiveId),
    );

    if (ind === -1) {
      logger.info(`Objective ${objectiveId} not found`);
      return false;
    }

    logger.debug(`Removing ${objectiveId} from position ${ind}`);
    const deletedObj = this.jobList.splice(ind, 1);
    logger.info(`Removed ${deletedObj[0].objectiveId} from job queue`);
    if (this.jobList.length > 0) {
      logger.debug(`Current jobs in job queue`);
      for (const obj of this.jobList) {
        logger.debug(`   - ${obj.objectiveId} - ${obj.status}`);
      }
    }
    await this.saveJobQueue();
    return true;
  }

  /**
   * Cancels a job and all its child jobs recursively
   * @param objectiveId The ID of the job to cancel
   * @returns Array of cancelled job IDs
   */
  async cancelJobAndChildren(objectiveId: string): Promise<string[]> {
    const cancelledJobs: string[] = [];

    // Find the job to cancel
    const jobToCancel = this.jobList.find(
      (job) => job.objectiveId === objectiveId,
    );
    if (!jobToCancel) {
      logger.warn(`Job ${objectiveId} not found in job list`);
      return cancelledJobs;
    }

    // Cancel the job itself
    jobToCancel.cancelJob();
    cancelledJobs.push(objectiveId);
    logger.info(`Cancelled job ${objectiveId}`);

    // Recursively cancel all child jobs
    const cancelChildren = (parentJobId: string) => {
      const childJobs = this.jobList.filter(
        (job) => job.parentId === parentJobId,
      );

      for (const childJob of childJobs) {
        childJob.cancelJob();
        cancelledJobs.push(childJob.objectiveId);
        logger.info(
          `Cancelled child job ${childJob.objectiveId} of parent ${parentJobId}`,
        );

        // Recursively cancel grandchildren
        cancelChildren(childJob.objectiveId);
      }
    };

    cancelChildren(objectiveId);

    logger.info(
      `Cancelled ${cancelledJobs.length} jobs total: ${cancelledJobs.join(', ')}`,
    );
    await this.saveJobQueue();
    return cancelledJobs;
  }

  /**
   * Sets job in the queue as active
   */
  setActiveJob(index?: number): Objective {
    if (!index) {
      index = 0;
    }

    if (index > this.jobList.length - 1) {
      logger.error(
        `No job in position ${index}. Only ${this.jobList.length} jobs in queue`,
      );
      return;
    } else if (this.jobList.length > 0) {
      logger.info(
        `Setting ${this.jobList[index].objectiveId} as active, removing from main job queue`,
      );
      this.activeJob = this.jobList[index];
      this.removeJob(this.jobList[index].objectiveId);
    } else {
      this.activeJob = null;
      logger.warn(`Not able to assign a job to active`);
    }
    return this.activeJob;
  }

  /**
   * Executes all jobs in the job list
   */
  async executeJobList() {
    while (true) {
      if (this.jobList.length === 0) {
        await sleep(5, 'no-more-jobs', false);
        await this.appendJob(new IdleObjective(this, this.role));
      } else if (this.jobList.length > 0) {
        const currentJob = this.jobList[0];
        this.currentExecutingJob = currentJob;
        logger.info(`Executing job ${currentJob.objectiveId}`);
        await currentJob.execute();
        await this.removeJob(currentJob.objectiveId);
        this.currentExecutingJob = undefined;
      }
    }
  }

  /********
   * Character activity functions
   ********/

  /********
   * Character detail functions
   ********/

  /**
   * Returns the percentage of health we have and what is needed to get to 100%
   * @param character
   */
  checkHealth(): HealthStatus {
    return {
      percentage: (this.data.hp / this.data.max_hp) * 100,
      difference: this.data.max_hp - this.data.hp,
    };
  }

  /**
   * @description Check inventory for a specific item
   * @returns the amount found in inventory
   */
  checkQuantityOfItemInInv(contentCode: string): number {
    if (!this.data || !this.data.inventory) {
      return 0;
    }
    const foundItem = this.data.inventory.find(
      (item) => item.code === contentCode,
    );
    let num = 0;
    if (foundItem) {
      num = foundItem.quantity;
    } else {
      num = 0;
    }
    logger.debug(`Found ${num} ${contentCode} in inventory`);
    return num;
  }

  /**
   * @description gets the level of a specific skill. Returns the character level if no parameter passed in
   * @returns {number}
   */
  getCharacterLevel(skillName?: Skill): number {
    switch (skillName) {
      case 'alchemy':
        return this.data.alchemy_level;
      case 'cooking':
        return this.data.cooking_level;
      case 'fishing':
        return this.data.fishing_level;
      case 'gearcrafting':
        return this.data.gearcrafting_level;
      case 'jewelrycrafting':
        return this.data.jewelrycrafting_level;
      case 'mining':
        return this.data.mining_level;
      case 'weaponcrafting':
        return this.data.weaponcrafting_level;
      case 'woodcutting':
        return this.data.woodcutting_level;
      default:
        return this.data.level;
    }
  }

  /**
   * @description Checks what gear is in the provided slot
   */
  getCharacterGearIn(itemSlot: ItemSlot): string {
    switch (itemSlot) {
      case 'amulet':
        return this.data.amulet_slot;
      case 'body_armor':
        return this.data.body_armor_slot;
      case 'boots':
        return this.data.boots_slot;
      case 'helmet':
        return this.data.helmet_slot;
      case 'leg_armor':
        return this.data.leg_armor_slot;
      case 'ring1':
        return this.data.ring1_slot;
      case 'ring2':
        return this.data.ring2_slot;
      case 'shield':
        return this.data.shield_slot;
      case 'utility1':
        return this.data.utility1_slot;
      case 'utility2':
        return this.data.utility2_slot;
      case 'weapon':
        return this.data.weapon_slot;
      default:
        logger.warn(
          `Checking gear in slot ${itemSlot} is unavailable right now`,
        );
        return '';
    }
  }

  /**
   * @description Check bank for a specific item
   * @returns the amount found in the bank
   */
  async checkQuantityOfItemInBank(contentCode: string): Promise<number> {
    const bankItem = await getBankItems(contentCode);
    if (bankItem instanceof ApiError) {
      this.handleErrors(bankItem);
    } else {
      if (bankItem.total === 0) {
        return 0;
      } else if (bankItem.total === 1) {
        return bankItem.data[0].quantity;
      } else {
        let total = 0;
        for (const item of bankItem.data) {
          total += item.quantity;
        }
        return total;
      }
    }
  }

  /**
   * Checks if the character is in cooldown. Sleep until if finishes if yes
   * @param character
   * @returns {boolean}
   * @todo I don't think this needs to return anything?
   */
  async cooldownStatus() {
    const targetDate = new Date(this.data.cooldown_expiration);

    const now = new Date();

    if (now > targetDate) {
      return { inCooldown: false, timeRemaining: 0 };
    } else {
      const timeToWait =
        Math.floor((targetDate.getTime() - now.getTime()) / 1000) + 2; // Arbitrarily adding 2 secconds here
      logger.info(
        `Cooldown is still ongoing. Waiting for ${timeToWait} seconds until ${this.data.cooldown_expiration}`,
      );
      await sleep(timeToWait, 'cooldown');
    }
  }

  /**
   * @description Deposit all inventory items into bank
   */
  async depositAllItems() {
    const job = new DepositObjective(this, {
      code: 'all',
      quantity: 0,
    });
    await this.executeJobNow(
      job,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Finds the closest map based on manhattan distance from current location
   */
  evaluateClosestMap(maps: MapSchema[]): MapSchema {
    let closestDistance = 1000000;
    let closestMap: MapSchema;

    if (maps.length === 0) {
      return;
    }

    maps.forEach((map) => {
      const dist =
        Math.abs(this.data.x - map.x) + Math.abs(this.data.y - map.y);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestMap = map;
      }
    });

    if (this.data.x !== closestMap.x && this.data.y !== closestMap.y) {
      logger.info(
        `Closest ${closestMap.skin} is at x: ${closestMap.x}, y: ${closestMap.y}`,
      );
    }

    return closestMap;
  }

  /**
   * @description Remove an item from the itemsToKeep list
   */
  removeItemFromItemsToKeep(itemCode: string) {
    if (this.itemsToKeep.includes(itemCode)) {
      logger.info(`Removing ${itemCode} from exceptions list`);
      this.itemsToKeep.splice(this.itemsToKeep.indexOf(itemCode), 1);
    } else {
      logger.warn(`Can't remove item code ${itemCode} from itemsToKeep list`);
    }
  }

  /********
   * Item functions
   ********/

  /**
   * @description Check currently equipped weapon
   * @todo Expand this to factor in resistances/vulnerabilities of mobs
   * @returns {boolean}
   *  - true means the currently equipped weapon is beneficial for the activity
   *  - false means it is not beneficial
   */
  async checkWeaponForEffects(
    typeOfActivity: WeaponFlavours,
  ): Promise<boolean> {
    let isEffective: boolean = false;
    const weaponDetails = await getItemInformation(this.data.weapon_slot);

    if (weaponDetails instanceof ApiError) {
      logger.info(weaponDetails.message);
      return false;
    } else {
      if (
        weaponDetails.type === 'weapon' &&
        weaponDetails.subtype === '' &&
        typeOfActivity === 'combat'
      ) {
        isEffective = true;
      } else if (weaponDetails.effects) {
        for (const effect of weaponDetails.effects) {
          if (effect.code === typeOfActivity) {
            isEffective = true;
          }
        }
      }
      if (isEffective) {
        logger.info(`Current weapon is suitable for ${typeOfActivity}`);
        return true;
      } else {
        logger.info(`Current weapon is NOT suitable for ${typeOfActivity}`);
        return false;
      }
    }
  }

  async findBestWeaponForJob(typeOfActivity: GatheringSkill): Promise<string> {
    logger.debug(`Type of activity is ${typeOfActivity}`);
    const weapons = this.weaponMap[typeOfActivity];
    logger.debug(`Found ${weapons?.length || 0} weapons for ${typeOfActivity}`);

    if (!weapons || weapons.length === 0) {
      logger.debug(`No weapons found for ${typeOfActivity}`);
      return;
    }

    this.weaponMap[typeOfActivity].forEach((weapon) => {
      logger.debug(`${weapon.code}`);
    });
  }

  /**
   * @description Eat the required amount of preferred food to recover fully
   */
  async eatFood() {
    await this.setPreferredFood();

    const healthStatus: HealthStatus = this.checkHealth();

    const preferredFoodHealValue = this.consumablesMap.heal
      .find((food) => food.code === this.preferredFood)
      .effects.find((effect) => effect.code === 'heal').value;

    let amountNeededToEat = Math.ceil(
      healthStatus.difference / preferredFoodHealValue,
    );

    const numInInv = this.checkQuantityOfItemInInv(this.preferredFood);
    if (amountNeededToEat > numInInv) {
      logger.info(
        `Only have ${numInInv} ${this.preferredFood} in inventory. Will set new preferred food`,
      );
      amountNeededToEat = numInInv;
    }

    logger.info(
      `Eating ${amountNeededToEat} ${this.preferredFood} to recover ${healthStatus.difference} health`,
    );

    const useResponse = await actionUse(this.data, {
      code: this.preferredFood,
      quantity: amountNeededToEat,
    });
    if (useResponse instanceof ApiError) {
      this.handleErrors(useResponse);
    } else {
      if (useResponse.data.character) {
        this.data = useResponse.data.character;
      } else {
        logger.error('Use item response missing character data');
      }
    }
  }

  /**
   * @description Equips a utility into the specified slot.
   * Calculates how many potions we need to reach max number.
   * Checks inventory and bank for the amount we need.
   * @returns a boolean stating whether we need to move back to our original location
   */
  async equipUtility(
    utilityType: UtilityEffects,
    slot: ItemSlot,
  ): Promise<boolean> {
    const utility = this.utilitiesMap[utilityType];

    for (let ind = utility.length - 1; ind >= 0; ind--) {
      if (utility[ind].level <= this.getCharacterLevel()) {
        let numNeeded: number;
        if (slot === 'utility1') {
          numNeeded =
            this.maxEquippedUtilities - this.data.utility1_slot_quantity;
        } else {
          numNeeded =
            this.maxEquippedUtilities - this.data.utility2_slot_quantity;
        }

        const numInInv = this.checkQuantityOfItemInInv(utility[ind].code);

        logger.debug(`Attempting to equip ${utility[ind].name}`);
        if (numInInv >= numNeeded) {
          logger.debug(`Carrying ${numInInv} in inv. Equipping them`);
          await this.equipNow(utility[ind].code, slot, numInInv);
          return false;
        } else if (numInInv > 0 && numInInv < numNeeded) {
          logger.debug(
            `Carrying ${numInInv} in inv. Equipping them and checking bank`,
          );
          await this.equipNow(utility[ind].code, slot, numInInv);
          numNeeded = numNeeded - numInInv;
          logger.debug(`${numNeeded} needed from the bank`);
        }
        const numInBank = await this.checkQuantityOfItemInBank(
          utility[ind].code,
        );
        if (numInBank > 0) {
          await this.withdrawNow(
            Math.min(numInBank, numNeeded),
            utility[ind].code,
          );
          await this.equipNow(
            utility[ind].code,
            slot,
            Math.min(numInBank, numNeeded),
          );
          return true;
        } else {
          logger.debug(`Can't find any ${utility[ind].name}`);
        }
      }
    }
  }

  /**
   * @description top up the preferred food from the bank until we have the amount we want
   * Moves back to the previous location if one is provided
   */
  async topUpFood(priorLocation?: DestinationSchema) {
    if (!this.preferredFood) {
      logger.debug(`No preferred food set to top up`);
      this.setPreferredFood();
      return;
    }

    // Check to make sure we have enough preferred food in the bank. If there's none, set a new preferred food
    const numInBank = await this.checkQuantityOfItemInBank(this.preferredFood);
    if (numInBank === 0) {
      this.setPreferredFood();
    }

    const numNeeded = Math.min(
      numInBank,
      this.desiredFoodCount - this.checkQuantityOfItemInInv(this.preferredFood),
    );

    await this.withdrawNow(numNeeded, this.preferredFood);

    if (priorLocation) {
      await this.move(priorLocation);
    }
  }

  /********
   * Inventory functions
   ********/

  /**
   * @description if inventory if 90% full, we empty everything into the bank
   * @param exceptions List of items that will not get deposited. Useful for keeping food when fighting, etc
   * @param priorLocation If we move to the bank to deposit, we move back to these coordinates to continue activities
   * @param makeSpaceForOtherItems If we need to make space but not above the 90% threshold, this will empty our inv
   * except for our exception items
   * @returns {boolean}
   *  - true means bank was visited and items deposited
   *  - false means nothing happened
   * @todo This should move back to the original location after depositing
   */
  async evaluateDepositItemsInBank(
    exceptions?: string[],
    priorLocation?: SimpleMapSchema,
    makeSpaceForOtherItems?: boolean,
  ): Promise<boolean> {
    const usedInventorySpace = this.getInventoryFullness();
    if (
      usedInventorySpace >= this.data.inventory_max_items * 0.9 ||
      makeSpaceForOtherItems
    ) {
      logger.warn(`Inventory is almost full. Depositing items`);
      const maps = await getMaps({ content_type: 'bank' });
      if (maps instanceof ApiError) {
        logger.warn(`Failed to get bank map`);
        return this.handleErrors(maps);
      }

      const contentLocation = this.evaluateClosestMap(maps.data);

      await this.move({ x: contentLocation.x, y: contentLocation.y });

      const itemsToDeposit: SimpleItemSchema[] = [];
      for (const item of this.data.inventory) {
        if (item.quantity === 0) {
          // If the item slot is empty we can ignore
          continue;
        } else if (exceptions && exceptions.includes(item.code)) {
          logger.info(`Not depositing ${item.code} because we need it`);
        } else {
          logger.debug(`Adding ${item.quantity} ${item.code} to deposit list`);
          itemsToDeposit.push({ code: item.code, quantity: item.quantity });
        }
      }

      const response = await actionDepositItems(this.data, itemsToDeposit);

      if (response instanceof ApiError) {
        this.handleErrors(response);
        await this.evaluateDepositItemsInBank(exceptions, priorLocation);
      } else {
        if (response.data.character) {
          this.data = response.data.character;
        } else {
          logger.error('Deposit item response missing character data');
        }
        await this.move(priorLocation);
      }
      return true;
    }
    return false;
  }

  /**
   * @returns what percentage of the backpack is full
   */
  getInventoryFullness(): number {
    if (!this.data || !this.data.inventory) {
      return 0;
    }
    let usedSpace = 0;
    this.data.inventory.forEach((invSlot) => {
      usedSpace += invSlot.quantity;
    });

    return Math.round((usedSpace / this.data.inventory_max_items) * 100);
  }

  /**
   * @description Checks inventory for the desired food and tops it up if we need too
   * Sets the preferred food if there isn't one already set
   * @todo Need to set a new preferredFood if we don't have any in inv or bank
   * @returns {boolean} stating whether we have a good amount of food or not
   */
  async checkFoodLevels(): Promise<boolean> {
    if (this.preferredFood) {
      logger.debug(`Preferred food is ${this.preferredFood}`);
      const amountCurrFood = this.checkQuantityOfItemInInv(this.preferredFood);
      if (amountCurrFood > this.minFood) {
        return true;
      } else {
        return false;
      }
    } else {
      logger.debug(`No preferred food. Finding one`);
      return await this.setPreferredFood();
    }
  }

  /**
   * @description Preferred food is used to withdraw from the bank without having to figure out what food is available
   * @returns true if successful, false otherwise
   */
  async setPreferredFood(): Promise<boolean> {
    if (!this.data || !this.data.inventory) {
      return false;
    }
    const foundItem = this.data.inventory.find((invItem) => {
      return this.consumablesMap.heal.find(
        (item) => invItem.code === item.code,
      );
    });

    if (foundItem && foundItem.quantity > this.minFood) {
      logger.debug(
        `Found ${foundItem.quantity} ${foundItem.code} in inventory. Setting it as the preferred food`,
      );
      this.preferredFood = foundItem.code;

      if (foundItem.quantity <= this.minFood) {
        return false;
      } else {
        return true;
      }
    }
    logger.debug(`Not enough food in inventory. Checking bank to find some`);
    const bankItems = await getBankItems();
    if (bankItems instanceof ApiError) {
      this.handleErrors(bankItems);
    } else if (!bankItems) {
      logger.info(`No food items in the bank`);
      return true;
    } else {
      const foundItem = bankItems.data.find((bankItem) => {
        return this.consumablesMap.heal.find(
          (item) => bankItem.code === item.code,
        );
      });

      if (foundItem) {
        logger.debug(
          `Found ${foundItem.code} in the bank. Setting it as the preferred food`,
        );
        this.preferredFood = foundItem.code;
        return true;
      }
    }
  }

  /**
   * @description moves the character to the destination if they are not already there
   * @todo Take in a map_id as an alternative to x,y coords
   */
  async move(destination: DestinationSchema) {
    if (this.data.x === destination.x && this.data.y === destination.y) {
      return;
    }

    logger.info(`Moving to x: ${destination.x}, y: ${destination.y}`);

    const moveResponse = await actionMove(this.data, {
      x: destination.x,
      y: destination.y,
    });

    if (moveResponse instanceof ApiError) {
      this.handleErrors(moveResponse);
    } else {
      if (moveResponse.data.character) {
        this.data = moveResponse.data.character;
      } else {
        logger.error('Move response missing character data');
      }
    }
  }

  /**
   * @description moves the character to the destination if they are not already there
   */
  async rest() {
    const restResponse = await actionRest(this.data);

    if (restResponse instanceof ApiError) {
      this.handleErrors(restResponse);
    } else {
      logger.info(
        `Recovered ${restResponse.data.hp_restored} health from resting`,
      );
      if (restResponse.data.character) {
        this.data = restResponse.data.character;
      } else {
        logger.error('Rest response missing character data');
      }
    }
  }

  /********
   * Functions to add jobs to the job queue
   ********/

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craft(quantity: number, code: string) {
    this.appendJob(
      new CraftObjective(this, {
        code: code,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craftNow(quantity: number, code: string): Promise<boolean> {
    const craftJob = new CraftObjective(this, {
      code: code,
      quantity: quantity,
    });
    return await this.executeJobNow(
      craftJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Starts an items task and fulfills it.
   * If a task is not in progress, will start a new one
   * Hands in items as they are gathered
   */
  async doItemsTask(quantity: number) {
    this.appendJob(new ItemTaskObjective(this, quantity));
  }

  /**
   * @description Starts a monster task and fulfills it.
   * If a task is already in progress, it will continue with the current task
   * Turns it in the task master when complete
   */
  async doMonsterTask(quantity: number) {
    this.appendJob(new MonsterTaskObjective(this, quantity));
  }

  /**
   * @description deposit the specified items into the bank
   */
  async deposit(quantity: number, itemCode: string) {
    this.appendJob(
      new DepositObjective(this, {
        code: itemCode,
        quantity: quantity,
      }),
    );
  }

  /**
   * @description deposit the specified items into the bank
   * @todo Should be able to provide a list of items to deposit instead of depositing one type at a time
   */
  async depositNow(quantity: number, itemCode: string): Promise<boolean> {
    const depositJob = new DepositObjective(this, {
      code: itemCode,
      quantity: quantity,
    });

    return await this.executeJobNow(
      depositJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  async evaluateGear(activityType: WeaponFlavours, targetMob?: string) {
    const evaluateGearJob = new EvaluateGearObjective(
      this,
      activityType,
      targetMob,
    );

    return await this.executeJobNow(
      evaluateGearJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description equip the item
   */
  async equip(itemName: string, itemSlot: ItemSlot, quantity?: number) {
    this.appendJob(new EquipObjective(this, itemName, itemSlot, quantity));
  }

  /**
   * @description equip the item now. Creates a new equip job at the
   * beginning of the job list and executes it
   */
  async equipNow(
    itemName: string,
    itemSlot: ItemSlot,
    quantity?: number,
  ): Promise<boolean> {
    const equipJob = new EquipObjective(this, itemName, itemSlot, quantity);
    return await this.executeJobNow(
      equipJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description equip the item from the slot specified
   */
  async unequip(itemSlot: ItemSlot, quantity?: number) {
    this.appendJob(new UnequipObjective(this, itemSlot, quantity));
  }

  /**
   * @description equip the item from the slot specified
   */
  async unequipNow(itemSlot: ItemSlot, quantity?: number): Promise<boolean> {
    const unequipJob = new UnequipObjective(this, itemSlot, quantity);
    return await this.executeJobNow(
      unequipJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Fight the requested amount of mobs
   */
  async fight(quantity: number, code: string) {
    this.appendJob(
      new FightObjective(this, { code: code, quantity: quantity }),
    );
  }

  /**
   * @description Creates a new fight objective and executes it
   */
  async fightNow(quantity: number, code: string): Promise<boolean> {
    const fightJob = new FightObjective(this, {
      code: code,
      quantity: quantity,
    });

    return await this.executeJobNow(
      fightJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gather(
    quantity: number,
    code: string,
    checkBank?: boolean,
    includeInventory?: boolean,
  ) {
    this.appendJob(
      new GatherObjective(
        this,
        {
          code: code,
          quantity: quantity,
        },
        checkBank,
        includeInventory,
      ),
    );
  }

  /**
   * @description calls the gather endpoint on the current map
   */
  async gatherNow(
    quantity: number,
    code: string,
    checkBank?: boolean,
    includeInventory?: boolean,
  ): Promise<boolean> {
    const gatherJob = new GatherObjective(
      this,
      {
        code: code,
        quantity: quantity,
      },
      checkBank,
      includeInventory,
    );

    return await this.executeJobNow(
      gatherJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Increases the combat level to the target level
   */
  async trainCombatLevel(targetLevel: number) {
    this.appendJob(new TrainCombatObjective(this, targetLevel));
  }

  /**
   * @description Increases the combat level to the target level
   */
  async trainCombatLevelNow(targetLevel: number) {
    return await this.executeJobNow(new TrainCombatObjective(this, targetLevel));
  }

  /**
   * @description levels the specified craft skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async trainCraftingSkill(targetSkill: CraftSkill, targetLevel: number) {
    this.appendJob(
      new TrainCraftingSkillObjective(this, targetSkill, targetLevel),
    );
  }

  /**
   * @description levels the specified craft skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async trainCraftingSkillNow(targetSkill: CraftSkill, targetLevel: number) {
    return await this.executeJobNow(
      new TrainCraftingSkillObjective(this, targetSkill, targetLevel),
    );
  }

  /**
   * @description levels the specified gathering skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async trainGatheringSkill(targetSkill: GatheringSkill, targetLevel: number) {
    this.appendJob(
      new TrainGatheringSkillObjective(this, targetSkill, targetLevel),
    );
  }

  /**
   * @description levels the specified gathering skill to the target level
   * @param targetSkill skill to train
   * @param targetLevel level to train too. Must be less than the max level 45
   */
  async trainGatheringSkillNow(
    targetSkill: GatheringSkill,
    targetLevel: number,
  ) {
    return await this.executeJobNow(
      new TrainGatheringSkillObjective(this, targetSkill, targetLevel),
    );
  }

  /**
   * @description Adds a recycle job to the end of the job queue
   */
  async recycleItem(itemCode: string, quantity: number) {
    this.appendJob(
      new RecycleObjective(this, { code: itemCode, quantity: quantity }),
    );
  }

  /**
   * @description Adds a recycle job to the start of the job queue
   */
  async recycleItemNow(itemCode: string, quantity: number) {
    return await this.executeJobNow(
      new RecycleObjective(this, { code: itemCode, quantity: quantity }),
    );
  }

  /**
   * @description Adds a fight simulation job to see if we'll win a fight
   */
  async simulateFightNow(
    mockCharacter: CharacterSchema,
    targetMobName?: string,
    targetMobSchema?: MonsterSchema,
    iterations?: number,
    debugLogs?: boolean,
  ) {
    if (!targetMobName && !targetMobSchema) {
      logger.error(
        `One of targetMobName or targetMobSchema must be passed in to simulateFightNow()`,
      );
      return false;
    }
    const job = new FightSimulator(
      this,
      mockCharacter,
      targetMobName,
      targetMobSchema,
      iterations,
      debugLogs,
    );

    return await this.executeJobNow(
      job,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Trade with an NPC
   */
  async tradeWithNpc(tradeType: TradeType, quantity: number, itemCode: string) {
    this.appendJob(new TradeObjective(this, tradeType, quantity, itemCode));
  }

  /**
   * @description trade with an NPC now
   */
  async tradeWithNpcNow(
    tradeType: TradeType,
    quantity: number,
    itemCode: string,
  ) {
    const job = new TradeObjective(this, tradeType, quantity, itemCode);
    return await this.executeJobNow(
      job,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description Tidy up the bank. Will be moved to be part of the idle tasks
   */
  async tidyUpBank() {
    const job = new TidyBankObjective(this, this.role);
    await this.executeJobNow(
      job,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdraw(quantity: number, itemCode: string) {
    this.appendJob(
      new WithdrawObjective(this, { code: itemCode, quantity: quantity }),
    );
  }

  /**
   * @description withdraw the specified items from the bank
   */
  async withdrawNow(quantity: number, itemCode: string): Promise<boolean> {
    const withdrawJob = new WithdrawObjective(this, {
      code: itemCode,
      quantity: quantity,
    });
    return await this.executeJobNow(
      withdrawJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  /**
   * @description handles the various errors that we may get back from API calls
   * @returns a boolean stating whether we should retry or not
   */
  async handleErrors(response: ApiError): Promise<boolean> {
    if (response.error.message) {
      logger.warn(`${response.error.message} [Code: ${response.error.code}]`);
    }
    switch (response.error.code) {
      case 404: // Code not found
        return false;
      case 422: // Invalid payload
        logger.error(`Invalid payload [Code: ${response.error.code}]`);
        return false;
      case 484: // The character cannot equip more than 100 utilities in the same slot.
        // ToDo: maybe do something here? Only equip enough to reach 100?
        return false;
      case 486: // An action is already in progress for this character.
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      case 488: // Character has not completed the task. Should not retry completing task
        return false;
      case 493: // Character's level is too low
        // ToDo: Maybe train the skill to the required level?
        return false;
      case 497: // The character's inventory is full. Dump everything
        await this.evaluateDepositItemsInBank(
          undefined,
          { x: this.data.x, y: this.data.y },
          true,
        );
        return true;
      case 499:
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      default:
        return false;
    }
  }
}
