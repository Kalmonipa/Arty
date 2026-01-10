import {
  actionDepositItems,
  actionMove,
  actionRest,
  actionTransition,
} from '../api_calls/Actions.js';
import {
  actionUse,
  getAllItemInformation,
  getItemInformation,
} from '../api_calls/Items.js';
import { getMaps, getMapsById } from '../api_calls/Maps.js';
import { HealthStatus, Role } from '../types/CharacterData.js';
import {
  ActiveEventSchema,
  CharacterSchema,
  CraftSkill,
  FakeCharacterSchema,
  GatheringSkill,
  ItemSchema,
  ItemSlot,
  MapSchema,
  SimpleEffectSchema,
  SimpleItemSchema,
  Skill,
} from '../types/types.js';
import {
  AllMaps,
  buildListOf,
  buildListOfWeapons,
  logger,
  sleep,
  TransitionLocations,
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
  SimpleObjectiveInfo,
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
import { ExpandBankObjective } from './BankExpansion.js';
import { getActiveEvents } from '../api_calls/Events.js';
import { EventObjective } from './EventObjective.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import {
  Overworld,
  SandWhisperIsle,
  SandwhisperMine,
  Underground,
} from '../names.js';
import {
  transitionFromSandwhisperMine,
  transitionToMainland,
  transitionToOverworld,
  transitionToSandwhisperIsle,
  transitionToSandwhisperMine,
  transitionToUndergroundMine,
} from './Movement.js';
import { CharRole } from '../constants.js';
import { getIgnoreEventList } from './CharacterConfig.js';

export class Character {
  data: CharacterSchema;

  /**
   * Maximum number of jobs allowed in the queue
   */
  maxJobsInQueue: number = 25;
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
   * @todo Should just make these available as a constant rather than a property of the Character
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
  weaponMap?: Record<WeaponFlavours, ItemSchema[]>;

  allMaps: MapSchema[];
  transitionLocations: MapSchema[];

  allCharacterDetails?: CharacterSchema[];

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
  /**
   * Last epoch time traded with Fish Merchant
   * Set it to a day ago as the initial value
   * ToDo: save this to state so that it persists
   */
  fishMerchantTradeDate: number = Math.round(Date.now() / 1000) - 86400;

  /**
   * Save a timestamp when we check for events
   * We'd only like to check for events every 5 minutes
   * Initial value is 5 minutes ago
   */
  lastEventCheckTimestamp: number = Math.round(Date.now() / 1000) - 300;

  /**
   * Set to true for the character to check events
   * If false, character will ignore events
   */
  enableEvents: boolean = true;

  /**
   * Lowest levels in the village. Used as a guide on what level gear we need and what
   * we can recycle
   */
  lowestCharLevel: number;
  highestCharLevel: number;
  lowestAlchemyLevel: number;
  lowestFishingLevel: number;
  lowestMiningLevel: number;
  lowestWoodcuttingLevel: number;

  /**
   * Events that we would like to participate in
   */
  applicableResourceEvents = [
    'magic_apparition',
    'strange_apparition',
    'bandit_camp',
    'portal_demon',
    'corrupted_ogre',
    'fish_merchant',
  ];

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
  async init(allCharacterDetails: CharacterSchema[]) {
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

    this.allMaps = await AllMaps();
    this.transitionLocations = TransitionLocations(this.allMaps);

    // Pulls all characters information so we can make judgements about equipment, potions, etc
    this.allCharacterDetails = allCharacterDetails;

    this.lowestCharLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.level < curr.level ? prev : curr,
    ).level;
    this.highestCharLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.level > curr.level ? prev : curr,
    ).level;
    this.lowestAlchemyLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.alchemy_level < curr.alchemy_level ? prev : curr,
    ).alchemy_level;
    this.lowestFishingLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.fishing_level < curr.fishing_level ? prev : curr,
    ).fishing_level;
    this.lowestMiningLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.mining_level < curr.mining_level ? prev : curr,
    ).mining_level;
    this.lowestWoodcuttingLevel = allCharacterDetails.reduce((prev, curr) =>
      prev.woodcutting_level < curr.woodcutting_level ? prev : curr,
    ).woodcutting_level;

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
  listObjectivesWithParents(): Array<SimpleObjectiveInfo> {
    const objectives = [];
    for (const obj of this.jobList) {
      objectives.push({
        id: obj.objectiveId,
        parentId: obj.parentId,
        childId: obj.childId,
        status: obj.status,
        progress: obj.progress,
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
        enableEvents: this.enableEvents,
        itemsToKeep: this.itemsToKeep,
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

      this.enableEvents = jobQueueData.enableEvents;
      this.itemsToKeep = jobQueueData.itemsToKeep;

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
    } else if (job instanceof EventObjective) {
      return {
        activeEvent: job.activeEvent,
        previousLocation: job.previousLocation,
      };
    } else if (job instanceof ExpandBankObjective) {
      return {};
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
      return { quantity: job.quantity };
    } else if (job instanceof RecycleObjective) {
      return { target: job.target };
    } else if (job instanceof TrainCombatObjective) {
      return { targetLevel: job.targetLevel };
    } else if (job instanceof TrainCraftingSkillObjective) {
      return { skill: job.skill, targetLevel: job.targetLevel };
    } else if (job instanceof TrainGatheringSkillObjective) {
      return { skill: job.skill, targetLevel: job.targetLevel };
    } else if (job instanceof TradeObjective) {
      return {
        tradeType: job.tradeType,
        quantity: job.quantity,
        itemCode: job.itemCode,
      };
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
        case 'EventObjective':
          job = new EventObjective(
            this,
            specificData.activeEvent as ActiveEventSchema,
            specificData.previousLocation as MapSchema,
          );
          break;
        case 'ExpandBankObjective':
          job = new ExpandBankObjective(this);
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
        case 'RecycleObjective':
          job = new RecycleObjective(
            this,
            specificData.target as ObjectiveTargets,
          );
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
        case 'TradeObjective':
          job = new TradeObjective(
            this,
            specificData.tradeType as TradeType,
            specificData.quantity as number,
            specificData.itemCode as string,
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
    if (this.jobList.length >= this.maxJobsInQueue) {
      logger.warn(
        `Already ${this.maxJobsInQueue} jobs in queue. Can't add more`,
      );
      return;
    }
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
    if (this.jobList.length >= this.maxJobsInQueue) {
      logger.warn(
        `Already ${this.maxJobsInQueue} jobs in queue. Can't add more`,
      );
      return;
    }
    this.jobList.unshift(obj);
    await this.saveJobQueue();
  }

  /**
   * Inserts an objective into the specified position in the array
   */
  async insertJob(obj: Objective, index: number) {
    if (this.jobList.length >= this.maxJobsInQueue) {
      logger.warn(
        `Already ${this.maxJobsInQueue} jobs in queue. Can't add more`,
      );
      return;
    }
    this.jobList.splice(index, 0, obj);
    logger.info(`Inserted ${obj.objectiveId} into position ${index}`);
    await this.saveJobQueue();
  }

  /**
   * @description Pauses the current job
   * Maybe should pause the parent jobs too?
   */
  pauseJob() {
    logger.info(`${this.currentExecutingJob.objectiveId} set to paused`);
    this.currentExecutingJob.status = 'paused';
  }

  /**
   * @description Resume current job
   */
  resumeJob() {
    logger.info(`${this.currentExecutingJob.objectiveId} set to in_progress`);
    this.currentExecutingJob.status = 'in_progress';
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
      // Update rootId when parentId is set
      obj.updateRootId();
      logger.debug(`Set parentId ${parentId} for job ${obj.objectiveId}`);
    }

    if (trackInQueue) {
      if (prepend) {
        this.prependJob(obj);
      } else {
        this.appendJob(obj);
      }

      logger.debug(
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

    //logger.debug(`Removing ${objectiveId} from position ${ind}`);
    const deletedObj = this.jobList.splice(ind, 1);
    //logger.debug(`Removed ${deletedObj[0].objectiveId} from job queue`);
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
  async setActiveJob(index?: number): Promise<Objective> {
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
      await this.removeJob(this.jobList[index].objectiveId);
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

        // Check if job is already completed (executed via executeJobNow)
        if (
          currentJob.status === 'complete' ||
          currentJob.status === 'cancelled' ||
          currentJob.status === 'failed'
        ) {
          logger.info(
            `Removing completed job ${currentJob.objectiveId} with status: ${currentJob.status}`,
          );
          await this.removeJob(currentJob.objectiveId);
          continue;
        }

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

  /**
   * @description Checks if there are any active jobs and creates an EventObjective to do it
   */
  async checkForActiveEvents(): Promise<boolean> {
    const currentTimestamp = Math.round(Date.now() / 1000);
    if (this.lastEventCheckTimestamp + 300 >= currentTimestamp) {
      logger.debug(
        `Last event check (${this.lastEventCheckTimestamp}) was within the last 300 seconds (${currentTimestamp}). Not checking again`,
      );
      return false;
    }

    const activeEventsResponse = await getActiveEvents({});
    if (activeEventsResponse instanceof ApiError) {
      await this.handleErrors(activeEventsResponse);
      this.lastEventCheckTimestamp = currentTimestamp;
      return false;
    }

    // Avoids creating an infinite loop
    for (const job of this.jobList) {
      logger.debug(`Checking Job ${job.objectiveId}`);
      if (job instanceof EventObjective) {
        logger.info(
          `Event job ${job.objectiveId} already in queue. Not starting a new event`,
        );

        const eventExpiration = new Date(job.activeEvent.expiration).getTime();

        if (Date.now() > eventExpiration) {
          logger.info(
            `Event ${job.objectiveId} expired at ${eventExpiration}. Moving back to map ${job.previousLocation.map_id} (x: ${job.previousLocation.x}, y: ${job.previousLocation.y})`,
          );
          await this.cancelJobAndChildren(job.objectiveId);
          this.lastEventCheckTimestamp = currentTimestamp;

          await this.move(job.previousLocation);

          return false;
        }

        this.lastEventCheckTimestamp = currentTimestamp;
        return false;
      }
    }

    for (const event of activeEventsResponse.data) {
      // ToDo: Make this better
      if (event.code === 'bandit_camp' && this.data.level < 25) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (event.code === 'portal_demon' && this.data.level < 30) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (event.code === 'corrupted_ogre' && this.data.level < 30) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (event.code === 'corrupted_owlbear' && this.data.level < 30) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (
        event.code === 'portal_efreet_sultan' &&
        this.data.level < 42
      ) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (event.code === 'corrupted_portal' && this.data.level < 45) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (
        event.code === 'attacking_the_island' &&
        this.data.level < 45
      ) {
        logger.debug(`${this.data.name} is too low level for ${event.name}`);
        continue;
      } else if (
        event.code === 'fish_merchant' &&
        (this.role !== 'fisherman' ||
          currentTimestamp < this.fishMerchantTradeDate + 86400)
      ) {
        logger.debug(
          `${this.data.name} is not a fisherman (${this.role}) or has already attempted a trade with fish merchant within the last 24 hours`,
        );
        logger.debug(
          `Last trade attempt was ${this.fishMerchantTradeDate}, current is ${currentTimestamp}`,
        );
        continue;
      }

      const ignoredEvents = await getIgnoreEventList()

      if (ignoredEvents.includes(event.code)) {
        logger.info(`Event ${event.code} is ignored via DB`)
        continue;
      }

      await this.executeJobNow(
        new EventObjective(this, event),
        true,
        true,
        this.currentExecutingJob.objectiveId,
      );
    }

    this.lastEventCheckTimestamp = currentTimestamp;
    return true;
  }

  /**
   * @description Equips 100 health potions into the utility 1 slot
   * utility 1 is reserved for health potions
   * @returns
   */
  async topUpHealthPots(potionToEquip?: string): Promise<boolean> {
    if (potionToEquip) {
      const numToEquip =
        this.maxEquippedUtilities - this.data.utility1_slot_quantity;
      return await this.equipNow(potionToEquip, 'utility1', numToEquip);
    } else if (this.data.utility1_slot_quantity <= this.minEquippedUtilities) {
      return await this.equipUtility('restore', 'utility1');
    }
  }

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
  getCharacterLevel(char: CharacterSchema, skillName?: Skill): number {
    switch (skillName) {
      case 'alchemy':
        return char.alchemy_level;
      case 'cooking':
        return char.cooking_level;
      case 'fishing':
        return char.fishing_level;
      case 'gearcrafting':
        return char.gearcrafting_level;
      case 'jewelrycrafting':
        return char.jewelrycrafting_level;
      case 'mining':
        return char.mining_level;
      case 'weaponcrafting':
        return char.weaponcrafting_level;
      case 'woodcutting':
        return char.woodcutting_level;
      default:
        return char.level;
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
    let numFound = 0;
    const bankItem = await getBankItems(contentCode);
    if (bankItem instanceof ApiError) {
      await this.handleErrors(bankItem);
      return 0;
    }

    if (bankItem.total === 0) {
      numFound = 0;
    } else if (bankItem.total === 1) {
      numFound = bankItem.data[0].quantity;
    } else {
      let total = 0;
      for (const item of bankItem.data) {
        total += item.quantity;
      }
      numFound = total;
    }
    logger.debug(`Found ${numFound} ${contentCode} in bank`);
    return numFound;
  }

  async getAllBankItems(): Promise<SimpleItemSchema[]> {
    let bankItems: SimpleItemSchema[] = [];

    const bankItemResponse = await getBankItems(undefined, undefined, 100);
    if (bankItemResponse instanceof ApiError) {
      await this.handleErrors(bankItemResponse);
      return;
    }

    bankItems = bankItemResponse.data;

    if (bankItemResponse.pages > 1) {
      for (let pages = 2; pages <= bankItemResponse.pages; pages++) {
        const bankItemPage = await getBankItems(undefined, pages, 100);
        if (bankItemPage instanceof ApiError) {
          await this.handleErrors(bankItemPage);
          return;
        }
        bankItems.push(...bankItemPage.data);
      }
    }

    return bankItems;
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
   * @description Creates a FakeCharacterSchema of the current character
   */
  createFakeCharacterSchema(character: CharacterSchema): FakeCharacterSchema {
    const fakeChar: FakeCharacterSchema = {
      level: character.level,
      weapon_slot: character.weapon_slot,
      rune_slot: character.rune_slot,
      shield_slot: character.shield_slot,
      helmet_slot: character.helmet_slot,
      body_armor_slot: character.body_armor_slot,
      leg_armor_slot: character.leg_armor_slot,
      boots_slot: character.boots_slot,
      ring1_slot: character.ring1_slot,
      ring2_slot: character.ring2_slot,
      amulet_slot: character.amulet_slot,
      artifact1_slot: character.artifact1_slot,
      artifact2_slot: character.artifact2_slot,
      artifact3_slot: character.artifact3_slot,
      utility1_slot: character.utility1_slot,
      utility2_slot: character.utility2_slot,
    };
    // if (includeUtility1 && character.utility1_slot) {
    //   fakeChar.utility1_slot_quantity = character.utility1_slot_quantity;
    // }
    // if (character.utility2_slot) {
    //   fakeChar.utility2_slot_quantity = character.utility2_slot_quantity;
    // }
    logger.debug(JSON.stringify(fakeChar));
    return fakeChar;
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
      // ToDo: Check the achievements to see if we can access the Sandwhisper Isle bank
      if (map.map_id === 1234) {
        logger.debug(`Sandwhisper Isle bank not unlocked. Skipping`);
        return;
      }
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
    if (!this.itemsToKeep) { // Hacky fix for undefined itemsToKeep
      this.itemsToKeep = []
    }
    if (this.itemsToKeep.includes(itemCode)) {
      logger.info(`Removing ${itemCode} from exceptions list`);
      this.itemsToKeep.splice(this.itemsToKeep.indexOf(itemCode), 1);
    } else {
      logger.debug(`Can't remove item code ${itemCode} from itemsToKeep list`);
    }
  }

  /**
   * @description Removes a list of items from the itemsToKeep list
   */
  removeItemListfromItemsToKeep(items: SimpleItemSchema[]) {
    for (const item of items) {
      this.removeItemFromItemsToKeep(item.code);
    }
  }

  /**
   * @description Add item to itemsToKeep list
   */
  addItemToItemsToKeep(itemCode: string) {
    if (!this.itemsToKeep) { // Hacky fix for undefined itemsToKeep
      this.itemsToKeep = []
    }
    if (this.itemsToKeep.includes(itemCode)) {
      logger.info(`${itemCode} already in exceptions list`);
      return;
    } else {
      logger.debug(`Adding ${itemCode} to itemsToKeep list`);
      this.itemsToKeep.push(itemCode);
      return;
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
   * @description Eat the required amount of food to recover fully
   */
  async recoverHealth(): Promise<boolean> {
    const healthStatus: HealthStatus = this.checkHealth();

    if (healthStatus.percentage !== 100) {
      if (healthStatus.difference < 150) {
        await this.rest();
        return true;
      } else {
        // Find the best available food
        let bestFood = await this.findBestFood();
        if (!bestFood) {
          logger.warn(
            `No food available in inventory or bank. Gathering some instead.`,
          );

          const fishToCook = await this.identifyFoodToEat();
          logger.info(`Found ${fishToCook}. Crafting 40 of them`);

          await this.craftNow(40, fishToCook, true, true);
          bestFood = {
            code: fishToCook,
            quantity: 40,
            healValue: 75,
            source: 'inventory',
          };
        }

        const healthStatus: HealthStatus = this.checkHealth();
        let amountNeededToEat = Math.ceil(
          healthStatus.difference / bestFood.healValue,
        );

        // If food is in bank, withdraw it first
        if (bestFood.source === 'bank') {
          const withdrawSuccess = await this.withdrawFoodIfNeeded(
            bestFood,
            amountNeededToEat,
          );
          if (!withdrawSuccess) {
            logger.warn(
              `Could not withdraw enough food from bank. Resting instead.`,
            );
            await this.rest();
            return true;
          }
        }

        // Check current inventory quantity after potential withdrawal
        const currentQuantity = this.checkQuantityOfItemInInv(bestFood.code);
        if (currentQuantity === 0) {
          logger.warn(
            `No food available in inventory after withdrawal attempt. Resting instead.`,
          );
          await this.rest();
          return true;
        }

        // Adjust amount to eat based on what's actually available
        amountNeededToEat = Math.min(amountNeededToEat, currentQuantity);

        logger.info(
          `Eating ${amountNeededToEat} ${bestFood.code} to recover ${healthStatus.difference} health`,
        );

        return await this.useItem(bestFood.code, amountNeededToEat);
      }
    }
    return true;
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
      logger.debug(`Evaluating ${utility[ind].code}`);
      if (utility[ind].level <= this.getCharacterLevel(this.data)) {
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
          await this.equipNow(utility[ind].code, slot, numNeeded);
          return true;
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
          if (
            utility[ind].level <= this.getCharacterLevel(this.data, 'alchemy')
          ) {
            logger.debug(`Can't find any ${utility[ind].name}. Crafting`);
            if (await this.craftNow(numNeeded, utility[ind].code)) {
              return await this.equipNow(utility[ind].code, slot, numNeeded);
            } else {
              logger.debug(`Can't craft ${utility[ind].name}`);
              return false;
            }
          } else {
            logger.debug(`Can't find any ${utility[ind].name}`);
          }
        }
      }
    }
  }

  /**
   * @description Equips a utility into slot 2 that will counteract the effect of a monster.
   * Calculates how many potions we need to reach max number.
   * Equips the most minor potion so we aren't overusing potions.
   * E.g We only get 20 poison when fighting spiders so equipping antidotes that recover 50 is unnecessary
   * @returns a boolean stating whether we need to move back to our original location
   */
  async equipAntiEffectUtility(
    utilityType: UtilityEffects,
    mobEffect: SimpleEffectSchema,
  ): Promise<boolean> {
    const utility = this.utilitiesMap[utilityType];

    // Find the best potion for the attack
    for (let ind = 0; ind <= utility.length - 1; ind++) {
      if (utility[ind].level > this.getCharacterLevel(this.data)) {
        continue;
      }
      // ToDo: Figure out a way to check all effects for the value
      if (
        utility[ind].effects &&
        utility[ind].effects[0].value < mobEffect.value
      ) {
        logger.debug(
          `${utility[ind].code} only counteracts ${utility[ind].effects[0].value} ${mobEffect.code}. Skipping`,
        );
        continue;
      }

      let numNeeded: number =
        this.maxEquippedUtilities - this.data.utility2_slot_quantity;

      const numInInv = this.checkQuantityOfItemInInv(utility[ind].code);

      logger.debug(`Attempting to equip ${utility[ind].name}`);
      if (numInInv >= numNeeded) {
        logger.debug(`Carrying ${numInInv} in inv. Equipping them`);
        await this.equipNow(utility[ind].code, 'utility2', numNeeded);
        return true;
      } else if (numInInv > 0 && numInInv < numNeeded) {
        logger.debug(
          `Carrying ${numInInv} in inv. Equipping them and checking bank`,
        );
        await this.equipNow(utility[ind].code, 'utility2', numInInv);
        numNeeded = numNeeded - numInInv;
        logger.debug(`${numNeeded} needed from the bank`);
      }
      const numInBank = await this.checkQuantityOfItemInBank(utility[ind].code);
      if (numInBank > 0) {
        await this.withdrawNow(
          Math.min(numInBank, numNeeded),
          utility[ind].code,
        );
        await this.equipNow(
          utility[ind].code,
          'utility2',
          Math.min(numInBank, numNeeded),
        );
        return true;
      } else {
        if (
          utility[ind].level <= this.getCharacterLevel(this.data, 'alchemy')
        ) {
          logger.debug(`Can't find any ${utility[ind].name}. Crafting`);
          if (await this.craftNow(numNeeded, utility[ind].code)) {
            return await this.equipNow(
              utility[ind].code,
              'utility2',
              numNeeded,
            );
          } else {
            logger.debug(`Can't craft ${utility[ind].name}`);
            return false;
          }
        } else {
          logger.debug(`Can't find any ${utility[ind].name}`);
        }
      }
    }
  }

  /**
   * @description top up food from the bank until we have the desired amount
   * Moves back to the previous location if one is provided
   */
  async topUpFood(priorLocation?: MapSchema) {
    // Find the best available food
    const bestFood = await this.findBestFood();
    if (!bestFood) {
      logger.warn(`No food available to top up`);
      return;
    }

    // If food is in bank, withdraw it to reach desired count
    if (bestFood.source === 'bank') {
      const currentQuantity = this.checkQuantityOfItemInInv(bestFood.code);
      const numNeeded = Math.min(
        bestFood.quantity,
        this.desiredFoodCount - currentQuantity,
      );

      if (numNeeded > 0) {
        logger.info(
          `Topping up ${bestFood.code}: withdrawing ${numNeeded} from bank (currently have ${currentQuantity} in inventory)`,
        );
        await this.withdrawNow(numNeeded, bestFood.code);
      } else {
        logger.debug(
          `Already have enough ${bestFood.code} in inventory (${currentQuantity}/${this.desiredFoodCount})`,
        );
      }
    } else {
      // Food is already in inventory, check if we need more
      const currentQuantity = this.checkQuantityOfItemInInv(bestFood.code);
      if (currentQuantity < this.desiredFoodCount) {
        logger.debug(
          `Have ${currentQuantity} ${bestFood.code} in inventory, desired ${this.desiredFoodCount}`,
        );
      }
    }

    if (priorLocation) {
      await this.move(priorLocation);
    }
  }

  async identifyFoodToEat(): Promise<string> {
    const defaultFish = 'cooked_gudgeon';

    const fishResourceInfo = await getAllResourceInformation({
      skill: 'fishing',
      max_level: this.data.level,
    });
    if (fishResourceInfo instanceof ApiError) {
      await this.handleErrors(fishResourceInfo);
      return defaultFish;
    }
    if (fishResourceInfo.data.length === 0) {
      logger.warn(`Found no fish to gather. Defaulting to ${defaultFish}`);
      return defaultFish;
    }

    const fish = fishResourceInfo.data[
      fishResourceInfo.data.length - 1
    ].drops.find((fishResource) => fishResource.rate === 1).code;
    logger.info(`Gathering ${fish} to recover health`);

    // We intentionally use fishing_level as the max level here to avoid cases where cooking skill might be too high for us to gather
    // the resources needed to cook it.
    const cookedItemInfo = await getAllItemInformation({
      craft_material: fish,
      craft_skill: 'cooking',
      max_level: this.data.level,
    });
    if (cookedItemInfo instanceof ApiError) {
      await this.handleErrors(cookedItemInfo);
      return defaultFish;
    }

    if (cookedItemInfo.data.length === 0) {
      logger.warn(`Found no fish to cook. Defaulting to cooked_gudgeon`);
      return defaultFish;
    }

    return cookedItemInfo.data[cookedItemInfo.data.length - 1].code;
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
    priorLocation?: MapSchema,
    makeSpaceForOtherItems?: boolean,
  ): Promise<boolean> {
    const usedInventorySpace = this.getInventoryFullness();
    if (
      usedInventorySpace >= this.data.inventory_max_items * 0.9 ||
      makeSpaceForOtherItems
    ) {
      logger.warn(`Inventory is almost full. Depositing all items`);
      logger.info(`Items to keep:`);
      // Quick hack to prevent panics. No clue why it's not  
      if (!this.itemsToKeep) {
        this.itemsToKeep = []
      }
      for (const item of this.itemsToKeep) {
        logger.info(`  - ${item}`);
      }
      const maps = await getMaps({ content_type: 'bank' });
      if (maps instanceof ApiError) {
        logger.warn(`Failed to get bank map`);
        return this.handleErrors(maps);
      }

      const contentLocation = this.evaluateClosestMap(maps.data);

      await this.move(contentLocation);

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

      // Check if we're actually depositing anything. If not then error and deposit the first item
      let numToDepost: number = 0;
      for (const item of itemsToDeposit) {
        numToDepost += item.quantity;
      }
      if (numToDepost === 0) {
        logger.error(
          `Not depositing anything when inventory is full. There's probably an issue with itemsToKeep`,
        );
        for (let index = this.data.inventory.length - 1; index >= 0; index--) {
          if (this.data.inventory[index].quantity === 0) {
            // If the item slot is empty we can ignore
            continue;
          } else {
            logger.info(
              `Adding ${this.data.inventory[index].quantity} ${this.data.inventory[index].code} to deposit list`,
            );
            itemsToDeposit.push({
              code: this.data.inventory[index].code,
              quantity: this.data.inventory[index].quantity,
            });
            break;
          }
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
   * @description Checks inventory for food and determines if we have enough
   * @returns {boolean} stating whether we have a good amount of food or not
   */
  async checkFoodLevels(): Promise<boolean> {
    const inventoryFood = this.findFoodInInventory();
    if (inventoryFood.length === 0) {
      logger.debug(`No food found in inventory`);
      return false;
    }

    // Check if any food in inventory meets minimum requirements
    for (const food of inventoryFood) {
      if (food.quantity > this.minFood) {
        logger.debug(
          `Found ${food.quantity} ${food.code} in inventory (min: ${this.minFood})`,
        );
        return true;
      }
    }

    logger.debug(
      `No food in inventory meets minimum requirements (${this.minFood})`,
    );
    return false;
  }

  /**
   * @description Ensures the character has enough food for activities
   * Will withdraw from bank if needed
   * @returns {boolean} true if character has sufficient food, false if no food is available
   */
  async ensureFoodAvailable(): Promise<boolean> {
    // First check if we already have enough food in inventory
    const inventoryFood = this.findFoodInInventory();
    for (const food of inventoryFood) {
      if (food.quantity >= this.minFood) {
        logger.debug(
          `Have sufficient ${food.code} in inventory (${food.quantity}/${this.minFood})`,
        );
        return true;
      }
    }

    // If not enough in inventory, find best food and withdraw if needed
    const bestFood = await this.findBestFood();
    if (!bestFood) {
      logger.warn(`No food available in inventory or bank`);
      return false;
    }

    // If food is in bank, withdraw it
    if (bestFood.source === 'bank') {
      const withdrawSuccess = await this.withdrawFoodIfNeeded(
        bestFood,
        this.minFood,
      );
      if (withdrawSuccess) {
        logger.info(
          `Withdrew ${bestFood.code} from bank to ensure sufficient food`,
        );
        return true;
      } else {
        logger.warn(`Could not withdraw enough ${bestFood.code} from bank`);
        return false;
      }
    }

    // Food is in inventory but not enough
    logger.warn(
      `Not enough ${bestFood.code} in inventory (${bestFood.quantity}/${this.minFood})`,
    );
    return false;
  }

  /**
   * @description Find food items in inventory that have heal effects
   * @returns Array of food items with heal effects found in inventory
   */
  findFoodInInventory(): {
    code: string;
    quantity: number;
    healValue: number;
  }[] {
    if (!this.data || !this.data.inventory) {
      return [];
    }

    const foodItems: { code: string; quantity: number; healValue: number }[] =
      [];

    for (const invItem of this.data.inventory) {
      const itemInfo = this.consumablesMap.heal.find(
        (item) => item.code === invItem.code,
      );
      if (itemInfo && itemInfo.effects) {
        const healEffect = itemInfo.effects.find(
          (effect) => effect.code === 'heal',
        );
        if (
          healEffect &&
          invItem.quantity > 0 &&
          itemInfo.level < this.data.level
        ) {
          foodItems.push({
            code: invItem.code,
            quantity: invItem.quantity,
            healValue: healEffect.value,
          });
        }
      }
    }

    return foodItems;
  }

  /**
   * @description Find food items in bank that have heal effects
   * @returns Array of food items with heal effects found in bank
   */
  async findFoodInBank(): Promise<
    { code: string; quantity: number; healValue: number }[]
  > {
    const bankItems = await this.getAllBankItems();
    if (!bankItems || bankItems.length === 0) {
      return [];
    }

    const foodItems: { code: string; quantity: number; healValue: number }[] =
      [];

    for (const bankItem of bankItems) {
      // Check if this item has heal effects
      const itemInfo = this.consumablesMap.heal.find(
        (item) => item.code === bankItem.code,
      );
      if (itemInfo && itemInfo.effects) {
        const healEffect = itemInfo.effects.find(
          (effect) => effect.code === 'heal',
        );
        if (
          healEffect &&
          bankItem.quantity > 0 &&
          itemInfo.level < this.data.level
        ) {
          foodItems.push({
            code: bankItem.code,
            quantity: bankItem.quantity,
            healValue: healEffect.value,
          });
        }
      }
    }

    return foodItems;
  }

  /**
   * @description Find the best food item available (inventory first, then bank)
   * @returns Best food item or null if none found
   */
  async findBestFood(): Promise<{
    code: string;
    quantity: number;
    healValue: number;
    source: 'inventory' | 'bank';
  } | null> {
    // First check inventory
    const inventoryFood = this.findFoodInInventory();
    if (inventoryFood.length > 0) {
      // Sort by heal value (descending) and return the best one
      const bestFood = inventoryFood.sort(
        (a, b) => b.healValue - a.healValue,
      )[0];
      return { ...bestFood, source: 'inventory' };
    }

    // If no food in inventory, check bank
    const bankFood = await this.findFoodInBank();
    if (bankFood.length > 0) {
      // Prefer cheese or fish_soup over anything else if we have it for the achievements
      // ToDo: Only do this if we need to complete the achievement
      const achievementFoods = bankFood.find((food) => food.code === 'cheese' || food.code === 'fish_soup');
      if (achievementFoods) {
        return {
          ...achievementFoods,
          source: 'bank',
        };
      } else {
        // Sort by heal value (descending) and return the best one
        const bestFood = bankFood.sort((a, b) => b.healValue - a.healValue)[0];
        return { ...bestFood, source: 'bank' };
      }
    }

    return null;
  }

  /**
   * @description Withdraw food from bank if needed
   * @param foodItem The food item to withdraw
   * @param quantityNeeded How much food is needed
   * @returns true if successful, false otherwise
   */
  async withdrawFoodIfNeeded(
    foodItem: { code: string; quantity: number; healValue: number },
    quantityNeeded: number,
  ): Promise<boolean> {
    const currentQuantity = this.checkQuantityOfItemInInv(foodItem.code);

    if (currentQuantity >= quantityNeeded) {
      return true; // Already have enough
    }

    const neededFromBank = quantityNeeded - currentQuantity;
    const availableInBank = foodItem.quantity;

    if (availableInBank >= neededFromBank) {
      logger.info(`Withdrawing ${neededFromBank} ${foodItem.code} from bank`);
      await this.withdrawNow(neededFromBank, foodItem.code);
      return true;
    } else {
      logger.warn(
        `Not enough ${foodItem.code} in bank (need ${neededFromBank}, have ${availableInBank})`,
      );
      return false;
    }
  }

  /**
   * @description moves the character to the destination if they are not already there
   * @todo Take in a map_id as an alternative to x,y coords
   */
  async move(destination: MapSchema): Promise<boolean> {
    if (
      (this.data.x === destination.x && this.data.y === destination.y) ||
      this.data.map_id === destination.map_id
    ) {
      return true;
    }

    if (this.data.y < 17 && destination.name === SandWhisperIsle) {
      const moveResult = await transitionToSandwhisperIsle(this);
      if (!moveResult) {
        logger.error(`Failed to move to SandWhisper Isle transition point`);
        return false;
      }
    } else if (this.data.y < 17 && destination.name === SandwhisperMine) {
      let moveResult = await transitionToSandwhisperIsle(this);
      if (!moveResult) {
        logger.error(`Failed to move to SandWhisper Isle transition point`);
        return false;
      }
      moveResult = await transitionToSandwhisperMine(this);
      if (!moveResult) {
        logger.error(`Failed to move to SandWhisper Mine transition point`);
        return false;
      }
    }

    if (
      this.data.y >= 17 &&
      this.data.layer === Underground &&
      destination.layer === Overworld
    ) {
      const moveResult = await transitionFromSandwhisperMine(this);
      if (!moveResult) {
        logger.error(
          `Failed to move to Sandwhisper Mine -> Isle transition point`,
        );
        return false;
      }
    }

    // y coord 17 and greater is all Sandwhisper Isle maps so can cheese it here a bit
    if (
      this.data.y >= 17 &&
      destination.name != SandWhisperIsle &&
      this.data.layer === Overworld
    ) {
      const moveResult = await transitionToMainland(this);
      if (!moveResult) {
        logger.error(
          `Failed to move to Mainland transition point or use recall potion`,
        );
        return false;
      }
    }

    // We're on the mainland in Overworld and would like to get to Underground Mine
    if (destination.layer === Underground && this.data.layer === Overworld) {
      logger.info(
        `Moving to ${destination.map_id} requires transitioning to ${destination.layer}`,
      );
      const moveResult = await transitionToUndergroundMine(this);
      if (!moveResult) {
        logger.error(`Failed to move to Underground transition point`);
        return false;
      }
    } else if (
      // We're Underground and would like to get to Overworld
      destination.layer === Overworld &&
      this.data.layer === Underground
    ) {
      const moveResult = await transitionToOverworld(this);
      if (!moveResult) {
        logger.error(`Failed to move to Overworld transition point`);
        return false;
      }
    }

    logger.info(
      `Moving to ${destination.name} (id: ${destination.map_id}, x: ${destination.x}, y: ${destination.y})`,
    );

    const moveResponse = await actionMove(this.data, {
      x: destination.x,
      y: destination.y,
    });

    if (moveResponse instanceof ApiError) {
      return this.handleErrors(moveResponse);
    } else {
      if (moveResponse.data.character) {
        this.data = moveResponse.data.character;
        return true;
      } else {
        logger.error('Move response missing character data');
        return false;
      }
    }
  }

  /**
   * @description Transition at the current map. Must be on a transition map before calling this
   */
  async transition(): Promise<boolean> {
    const transitionResponse = await actionTransition(this.data);
    if (transitionResponse instanceof ApiError) {
      this.handleErrors(transitionResponse);
      return false;
    } else {
      if (
        transitionResponse &&
        transitionResponse.data &&
        transitionResponse.data.character
      ) {
        this.data = transitionResponse.data.character;
        return true;
      } else {
        logger.warn(
          'Transition response missing character data, response structure:',
          transitionResponse,
        );
        return false;
      }
    }
  }

  /**
   * @description moves the character to the destination if they are not already there
   */
  async rest(): Promise<boolean> {
    const restResponse = await actionRest(this.data);

    if (restResponse instanceof ApiError) {
      this.handleErrors(restResponse);
      return false;
    } else {
      logger.info(
        `Recovered ${restResponse.data.hp_restored} health from resting`,
      );
      if (restResponse.data.character) {
        this.data = restResponse.data.character;
        return true;
      } else {
        logger.error('Rest response missing character data');
        return false;
      }
    }
  }

  /**
   * @description uses the specified item
   */
  async useItem(itemCode: string, quantity: number): Promise<boolean> {
    const useResponse = await actionUse(this.data, {
      code: itemCode,
      quantity: quantity,
    });
    if (useResponse instanceof ApiError) {
      this.handleErrors(useResponse);
      return false;
    } else {
      if (useResponse.data.character) {
        this.data = useResponse.data.character;
        return true;
      } else {
        logger.error('Use item response missing character data');
        return false;
      }
    }
  }

  /********
   * Functions to add jobs to the job queue
   ********/

  /**
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craft(
    quantity: number,
    code: string,
    checkBank?: boolean,
    includeInventory?: boolean,
  ) {
    this.appendJob(
      new CraftObjective(
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
   * @description Craft the item. Character must be on the correct crafting map
   */
  async craftNow(
    quantity: number,
    code: string,
    checkBank?: boolean,
    includeInventory?: boolean,
  ): Promise<boolean> {
    const craftJob = new CraftObjective(
      this,
      {
        code: code,
        quantity: quantity,
      },
      checkBank,
      includeInventory,
    );
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
  async fight(quantity: number, code: string, participants: string[]) {
    this.appendJob(
      new FightObjective(
        this,
        { code: code, quantity: quantity },
        participants,
      ),
    );
  }

  /**
   * @description Creates a new fight objective and executes it
   */
  async fightNow(
    quantity: number,
    code: string,
    participants?: string[],
    runFightSim?: boolean,
  ): Promise<boolean> {
    const fightJob = new FightObjective(
      this,
      {
        code: code,
        quantity: quantity,
      },
      participants,
      runFightSim,
    );

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
    return await this.executeJobNow(
      new TrainCombatObjective(this, targetLevel),
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
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
    mockCharacters: FakeCharacterSchema[],
    targetMobCode: string,
    iterations?: number,
    debugLogs?: boolean,
  ) {
    const job = new FightSimulator(
      this,
      mockCharacters,
      targetMobCode,
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
   * @description Tidy up the bank
   */
  async tidyUpBank(role: Role) {
    const job = new TidyBankObjective(this, role);
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
      case 462:
        return this.executeJobNow(new ExpandBankObjective(this));
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
      case 496: // Conditions not met
        return false;
      case 497: {
        // The character's inventory is full. Dump everything
        const mapData = await getMapsById(this.data.map_id);
        if (mapData instanceof ApiError) {
          logger.error(`Failed to get current map data`);
          return false;
        }
        await this.evaluateDepositItemsInBank(
          this.itemsToKeep,
          mapData.data,
          true,
        );
        return true;
      }
      case 499:
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      case 500: // Bad gateway from server
      case 502: // Bad gateway from server
        logger.warn('Sleeping for 5 minutes to avoid 5xx errors');
        await sleep(300, 'HTTP error code 5xx');
        return true;
      default:
        return false;
    }
  }
}
