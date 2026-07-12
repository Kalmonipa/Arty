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
import { HealthStatus, Role } from '../types/CharacterData.js';
import {
  AccountAchievementSchema,
  ActiveEventSchema,
  CharacterSchema,
  ConditionOperator,
  ConditionSchema,
  CraftSkill,
  FakeCharacterSchema,
  GatheringSkill,
  ItemSchema,
  ItemSlot,
  MapContentType,
  MapLayer,
  MapSchema,
  MonsterSchema,
  ResourceResponseSchema,
  SimpleEffectSchema,
  SimpleItemSchema,
  Skill,
  TaskTradeResponseSchema,
  TaskType,
} from '../types/types.js';
import {
  AllMaps,
  buildListOf,
  buildListOfWeapons,
  getHighestCharLevel,
  getLowestAlchemyLevel,
  getLowestCharLevel,
  getLowestFishingLevel,
  getLowestMiningLevel,
  getLowestWoodcuttingLevel,
  logger,
  sleep,
} from '../utils.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CraftObjective } from '../core/CraftObjective.js';
import { DepositObjective } from '../core/DepositObjective.js';
import { ApiError, TRANSPORT_ERROR_CODE } from '../core/Error.js';
import { GatherObjective } from '../core/GatherObjective.js';
import { Objective } from '../core/Objective.js';
import {
  ObjectiveTargets,
  ObjectiveStatus,
  SerializedJob,
  SimpleObjectiveInfo,
} from '../types/ObjectiveData.js';
import { FightObjective } from '../core/FightObjective.js';
import { EquipObjective } from '../core/EquipObjective.js';
import { UnequipObjective } from '../core/UnequipObjective.js';
import { WithdrawObjective } from '../core/WithdrawObjective.js';
import { MonsterTaskObjective } from '../core/MonsterTaskObjective.js';
import {
  actionDepositGold,
  getBankDetails,
  getBankItems,
} from '../api_calls/Bank.js';
import { ItemTaskObjective } from '../core/ItemTaskObjective.js';
import {
  UtilityEffects,
  WeaponFlavours,
  GearEffects,
  ConsumableEffects,
} from '../types/ItemData.js';
import { TrainGatheringSkillObjective } from '../core/TrainGatheringSkillObjective.js';
import { TidyBankObjective } from '../core/TidyBankObjective.js';
import { EvaluateGearObjective } from '../core/EvaluateGearObjective.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import { TradeType } from '../types/NPCData.js';
import { FightSimulator } from '../core/FightSimulator.js';
import { IdleObjective } from '../core/IdleObjective.js';
import { TrainCraftingSkillObjective } from '../core/TrainCraftingSkillObjective.js';
import { TrainCombatObjective } from '../core/TrainCombatObjective.js';
import { RecycleObjective } from '../core/RecycleObjective.js';
import { ExpandBankObjective } from '../core/BankExpansion.js';
import { getActiveEvents } from '../events/apiCalls.js';
import { EventObjective } from '../events/eventObjective.js';
import {
  getAllResourceInformation,
  getResourceInformation,
} from '../api_calls/Resources.js';
import { buildTransitionPath } from '../core/navigation/pathfinding.js';
import {
  getNavigationGraph,
  NavigationGraph,
} from '../core/navigation/graph.js';
import { ForestBankPotion, RecallPotion } from '../names.js';
import {
  BagSlot,
  BodyArmorSlot,
  CharRole,
  DesiredFoodCount,
  FishMerchant,
  HelmetSlot,
  MaxEquippedUtilities,
  MinEquippedUtilities,
  MinFood,
  NomadicMerchant,
  RuneSlot,
  ShieldSlot,
  WeaponSlot,
} from '../constants.js';
import { actionCompleteTask, actionTasksTrade } from '../api_calls/Tasks.js';
import { getAccountAchievements } from '../api_calls/Achievements.js';
import { shouldDoEvent } from '../events/functions.js';
import { db } from '../db.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { IdleHealerObjective } from '../core/IdleHealer.js';
import { IdleCrafterObjective } from '../core/IdleCrafter.js';

/**
 * Outcome of a single transition step. `reroute` is true when the step failed because the
 * game reported no walkable path (595), meaning move() should try a different route rather
 * than give up.
 */
type TransitionStepResult = { ok: boolean; reroute?: boolean };

export class Character {
  data: CharacterSchema;

  /**
   * Maximum number of jobs allowed in the queue
   */
  maxJobsInQueue: number = 25;
  /**
   * The top-level job currently being executed from the job queue
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
  artifactsMap?: Record<GearEffects, ItemSchema[]>;
  // ToDo: Get rune information
  //runesMap?: Record<

  consumablesMap?: Record<ConsumableEffects, ItemSchema[]>;
  utilitiesMap?: Record<UtilityEffects, ItemSchema[]>;
  weaponMap?: Record<WeaponFlavours, ItemSchema[]>;

  allMaps: MapSchema[];
  navigationGraph: NavigationGraph;

  monsterData: MonsterSchema[];

  // True while move() is acquiring items to pass a gated transition. Nested move()
  // calls (from gather/craft/buy sub-jobs) check this so acquisition can't recurse.
  private acquiringForTransition = false;

  // Cached id of the mainland overworld zone (the zone containing the spawn tile
  // at 0,0). Used by the recall-potion shortcut. undefined until first resolved.
  private mainlandZoneId?: number;

  allCharacterDetails?: CharacterSchema[];

  /**
   * List of items to keep when doing a deposit all
   */
  itemsToKeep: string[] = [];
  /**
   * Role of the character. One of Alchemist, Fighter, Fisherman, Lumberjack, Miner
   */
  role: Role;
  /** Last epoch time traded with Fish Merchant. Initial value ensures first check is eligible. */
  fishMerchantTradeDate: number = Math.round(Date.now() / 1000) - 86400;

  /** Last epoch time traded with Nomadic Merchant. Initial value ensures first check is eligible. */
  nomadicMerchantTradeDate: number = Math.round(Date.now() / 1000) - 86400;

  /**
   * Save a timestamp when we check for events
   * We'd only like to check for events every 5 minutes
   * Initial value is 5 minutes ago
   */
  lastEventCheckTimestamp: number = Math.round(Date.now() / 1000) - 300;

  /**
   * Per-event exponential backoff state. Maps event code to { failCount, nextRetryAt } where
   * nextRetryAt is a unix timestamp in seconds. Persisted in the job queue file.
   */
  eventBackoffs: Map<string, { failCount: number; nextRetryAt: number }> =
    new Map();

  /**
   * Set to true for the character to check events
   * If false, character will ignore events
   */
  enableEvents: boolean = true;

  /** Achievements completed by this character's account, loaded once at startup. */
  completedAchievements: AccountAchievementSchema[] = [];

  /**
   * Raw item codes dropped by fishing resources (e.g. gudgeon, trout).
   * Used to identify which cooking consumables are fish-based.
   */
  fishingDropCodes: Set<string> = new Set();

  /**
   * Lowest levels in the village. Used as a guide on what level gear we need and what
   * we can recycle
   */
  lowestCharLevel: number;
  /**
   * Highest character level in the village. Refreshes periodically so might have stale data
   */
  highestCharLevel: number;
  lowestAlchemyLevel: number;
  lowestFishingLevel: number;
  lowestMiningLevel: number;
  lowestWoodcuttingLevel: number;

  hasVoidStonePickaxe: boolean = false;
  hasRune: boolean = false;

  /**
   * Toggle that decides if the character should do idle jobs
   * Toggling off is mostly only useful for testing
   */
  shouldDoIdleJobs: boolean = true;

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
    this.artifactsMap = await buildListOf('artifact');
    this.consumablesMap = await buildListOf('consumable');
    this.utilitiesMap = await buildListOf('utility');
    this.weaponMap = await buildListOfWeapons();

    const fishingResources = await getAllResourceInformation({
      skill: 'fishing',
    });
    if (!(fishingResources instanceof ApiError)) {
      fishingResources.data.forEach((resource) =>
        resource.drops.forEach((drop) => this.fishingDropCodes.add(drop.code)),
      );
    } else {
      logger.warn(
        'Failed to load fishing resources — fish stocking will fall back to all cooking consumables',
      );
    }

    const monsterData = await getAllMonsterInformation({
      size: 1000,
    });
    if (monsterData instanceof ApiError) {
      logger.warn(
        `Failed to load monster data. [${monsterData.error.code}] ${monsterData.error.message}`,
      );
    } else {
      this.monsterData = monsterData.data;
    }

    // Warm the process-wide item cache with a single bulk fetch so subsequent
    // per-item getItemInformation lookups are served from memory.
    const itemData = await getAllItemInformation({
      size: 1000,
    });
    if (itemData instanceof ApiError) {
      logger.warn(
        `Failed to load item data. [${itemData.error.code}] ${itemData.error.message}`,
      );
    }

    this.allMaps = await AllMaps();
    this.navigationGraph = getNavigationGraph(this.allMaps);

    // Pulls all characters information so we can make judgements about equipment, potions, etc
    this.allCharacterDetails = allCharacterDetails;

    this.lowestCharLevel = getLowestCharLevel(allCharacterDetails);
    this.highestCharLevel = getHighestCharLevel(allCharacterDetails);
    this.lowestAlchemyLevel = getLowestAlchemyLevel(allCharacterDetails);
    this.lowestFishingLevel = getLowestFishingLevel(allCharacterDetails);
    this.lowestMiningLevel = getLowestMiningLevel(allCharacterDetails);
    this.lowestWoodcuttingLevel =
      getLowestWoodcuttingLevel(allCharacterDetails);

    this.role = CharRole;

    await this.loadCompletedAchievements();
    await this.loadJobQueue();
  }

  private async loadCompletedAchievements(): Promise<void> {
    this.completedAchievements = [];
    const size = 100;
    let page = 1;

    while (true) {
      const response = await getAccountAchievements(this.data.account, {
        completed: true,
        page: page,
        size: size,
      });
      if (response instanceof ApiError) {
        logger.warn(
          `Failed to load achievements for ${this.data.account}. Access restrictions will apply conservatively.`,
        );
        return;
      }
      this.completedAchievements.push(...response.data);

      const total = response.total ?? 0;
      if (page * size >= total) break;
      page++;
    }

    logger.info(
      `Loaded ${this.completedAchievements.length} completed achievements for ${this.data.account}`,
    );
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
        enableIdleJobs: this.shouldDoIdleJobs,
        itemsToKeep: this.itemsToKeep,
        fishMerchantTradeDate: this.fishMerchantTradeDate,
        nomadicMerchantTradeDate: this.nomadicMerchantTradeDate,
        eventBackoffs: Object.fromEntries(this.eventBackoffs),
        jobs: this.jobList.map((job) => this.serializeJob(job)),
      };

      await fs.writeFile(
        this.jobQueueFilePath,
        JSON.stringify(jobQueueData, null, 2),
      );
      // logger.debug(
      //   `Saved ${this.jobList.length} jobs to ${this.jobQueueFilePath}`,
      // );
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
      this.shouldDoIdleJobs = jobQueueData.enableIdleJobs;
      this.itemsToKeep = jobQueueData.itemsToKeep;
      if (jobQueueData.fishMerchantTradeDate != null) {
        this.fishMerchantTradeDate = jobQueueData.fishMerchantTradeDate;
      }
      if (jobQueueData.nomadicMerchantTradeDate != null) {
        this.nomadicMerchantTradeDate = jobQueueData.nomadicMerchantTradeDate;
      }
      if (jobQueueData.eventBackoffs) {
        this.eventBackoffs = new Map(
          Object.entries(jobQueueData.eventBackoffs),
        );
      }

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
        targetResource: job.targetResource,
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
            specificData.targetResource as string,
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
        case 'IdleHealerObjective':
          job = new IdleHealerObjective(this);
          break;
        case 'IdleCrafterObjective':
          job = new IdleCrafterObjective(this, this.role);
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

    this.jobList.splice(ind, 1);

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
   * Executes all jobs in the job list
   */
  async executeJobList() {
    while (true) {
      if (this.jobList.length === 0) {
        await sleep(5, 'no-more-jobs', false);

        // ToDo: I'm tempted to separate out the IdleCrafterObjective into specific crafter
        // roles. At the moment they are all the same so no need but I see that changing.
        if (this.shouldDoIdleJobs) {
          if (this.role === 'healer') {
            await this.appendJob(new IdleHealerObjective(this));
          } else if (this.role === 'weaponcrafter') {
            await this.appendJob(new IdleCrafterObjective(this, this.role));
          } else if (this.role === 'gearcrafter') {
            await this.appendJob(new IdleCrafterObjective(this, this.role));
          }  else if (this.role === 'jewelrycrafter') {
            await this.appendJob(new IdleCrafterObjective(this, this.role));
          }  else {
            await this.appendJob(new IdleObjective(this, this.role));
          }
        }
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

        this.activeJob = currentJob;
        this.currentExecutingJob = currentJob;
        logger.info(`Executing job ${currentJob.objectiveId}`);
        await currentJob.execute();
        await this.removeJob(currentJob.objectiveId);
        this.activeJob = undefined;
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

    // This for loop avoids creating an infinite loop
    for (const job of this.jobList) {
      logger.debug(`Checking Job ${job.objectiveId}`);
      if (job instanceof EventObjective) {
        logger.info(
          `Event job ${job.objectiveId} already in queue. Not starting a new event`,
        );

        const eventExpiration = new Date(job.activeEvent.expiration).getTime();

        if (Date.now() > eventExpiration) {
          logger.info(
            `Event ${job.objectiveId} expired at ${eventExpiration}.`,
          );
          if (job.previousLocation && job.previousLocation.map_id) {
            logger.info(
              `Moving back to map ${job.previousLocation.map_id} (x: ${job.previousLocation.x}, y: ${job.previousLocation.y})`,
            );
            await this.cancelJobAndChildren(job.objectiveId);
            this.lastEventCheckTimestamp = currentTimestamp;

            await this.move(job.previousLocation);
          }

          return false;
        }

        this.lastEventCheckTimestamp = currentTimestamp;
        return false;
      }
    }

    for (const event of activeEventsResponse.data) {
      if ((await shouldDoEvent(this, event.code)) === false) {
        continue;
      } else if (
        event.code === FishMerchant &&
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
      } else if (
        event.code === NomadicMerchant &&
        currentTimestamp < this.nomadicMerchantTradeDate + 86400
      ) {
        logger.debug(
          `${this.data.name} has already attempted a trade with nomadic merchant within the last 24 hours`,
        );
        logger.debug(
          `Last trade attempt was ${this.nomadicMerchantTradeDate}, current is ${currentTimestamp}`,
        );
        continue;
      }

      const backoff = this.eventBackoffs.get(event.code);
      if (backoff && currentTimestamp < backoff.nextRetryAt) {
        const remainingMinutes = Math.round(
          (backoff.nextRetryAt - currentTimestamp) / 60,
        );
        logger.debug(
          `Event ${event.code} in backoff period (attempt ${backoff.failCount}). ${remainingMinutes} minutes remaining.`,
        );
        continue;
      }

      let resourceInfo: ResourceResponseSchema | undefined;
      if (event.map.interactions.content?.type === MapContentType.resource) {
        const resourceInfoResponse = await getResourceInformation(
          event.map.interactions.content.code,
        );
        if (resourceInfoResponse instanceof ApiError) {
          logger.warn(
            `Could not fetch resource info for ${event.code}. Skipping.`,
          );
          continue;
        }
        const charSkillLevel = this.getCharacterLevel(
          this.data,
          resourceInfoResponse.data.skill,
        );
        if (charSkillLevel < resourceInfoResponse.data.level) {
          logger.debug(
            `${this.data.name} is not high enough ${resourceInfoResponse.data.skill} level` +
              ` (${charSkillLevel}/${resourceInfoResponse.data.level}) for ${event.code}`,
          );
          continue;
        }
        resourceInfo = resourceInfoResponse;
      }

      const objective = new EventObjective(this, event);
      if (resourceInfo) {
        objective.resourceInfo = resourceInfo;
      }
      await this.executeJobNow(
        objective,
        true,
        true,
        this.currentExecutingJob.objectiveId,
      );
    }

    this.lastEventCheckTimestamp = currentTimestamp;
    return true;
  }

  recordEventFailure(eventCode: string): void {
    const current = this.eventBackoffs.get(eventCode) ?? {
      failCount: 0,
      nextRetryAt: 0,
    };
    const backoffSeconds = Math.min(
      10 * 60 * Math.pow(2, current.failCount),
      8 * 60 * 60,
    );
    const nextRetryAt = Math.round(Date.now() / 1000) + backoffSeconds;
    const failCount = current.failCount + 1;
    this.eventBackoffs.set(eventCode, { failCount, nextRetryAt });
    logger.info(
      `Event ${eventCode} failed (attempt ${failCount}). Backing off for ${Math.round(backoffSeconds / 60)} minutes.`,
    );
  }

  recordEventSuccess(eventCode: string): void {
    if (this.eventBackoffs.has(eventCode)) {
      this.eventBackoffs.delete(eventCode);
      logger.debug(`Event ${eventCode} succeeded. Resetting backoff.`);
    }
  }

  /**
   * @description Equips 100 health potions into the utility 1 slot
   * utility 1 is reserved for health potions
   * @returns
   */
  async topUpHealthPots(potionToEquip?: string): Promise<boolean> {
    if (potionToEquip) {
      const numToEquip =
        MaxEquippedUtilities - this.data.utility1_slot_quantity;
      return await this.equipNow(potionToEquip, 'utility1', numToEquip);
    } else if (this.data.utility1_slot_quantity <= MinEquippedUtilities) {
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
   * @description Returns true if the character has the item equipped, false if not
   * Maybe I should return _where_ it is equipped?
   */
  hasEquipped(itemCode: string): boolean {
    const equippedItems = new Map<string, string>();
    equippedItems.set(WeaponSlot, this.data.weapon_slot);
    equippedItems.set(RuneSlot, this.data.rune_slot);
    equippedItems.set(ShieldSlot, this.data.shield_slot);
    equippedItems.set(HelmetSlot, this.data.helmet_slot);
    equippedItems.set(BodyArmorSlot, this.data.body_armor_slot);
    equippedItems.set('leg_armor_slot', this.data.leg_armor_slot);
    equippedItems.set('boots_slot', this.data.boots_slot);
    equippedItems.set('ring1_slot', this.data.ring1_slot);
    equippedItems.set('ring2_slot', this.data.ring2_slot);
    equippedItems.set('amulet_slot', this.data.amulet_slot);
    equippedItems.set('artifact1_slot', this.data.artifact1_slot);
    equippedItems.set('artifact2_slot', this.data.artifact2_slot);
    equippedItems.set('artifact3_slot', this.data.artifact3_slot);
    equippedItems.set('utility1_slot', this.data.utility1_slot);
    equippedItems.set('utility2_slot', this.data.utility2_slot);
    equippedItems.set(BagSlot, this.data.bag_slot);

    equippedItems.forEach((value, key) => {
      if (value === itemCode) {
        logger.info(`${this.data.name} has ${itemCode} equipped in ${key}`);
        return true;
      }
    });
    logger.info(`${this.data.name} does NOT have ${itemCode} equipped`);
    return false;
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
      case 'artifact1':
        return this.data.artifact1_slot;
      case 'artifact2':
        return this.data.artifact2_slot;
      case 'artifact3':
        return this.data.artifact3_slot;
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
    logger.debug(`Found ${bankItems.length} items in the bank`);
    logger.debug(`There are ${bankItemResponse.pages} pages of items found`);

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
   * @returns
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
   * @description Looks up maps from the in-memory snapshot by content code and/or
   * type, mirroring the /maps endpoint's content filters. Prefer this over the API
   * for static content (resources, monsters, workshops, banks, npcs, tasks
   * masters). Event-spawned content is dynamic and absent from the snapshot, so
   * keep using the API for those lookups.
   */
  findMaps(filter: {
    content_code?: string;
    content_type?: MapContentType;
  }): MapSchema[] {
    return this.allMaps.filter((map) => {
      const content = map.interactions.content;
      if (!content) return false;
      if (
        filter.content_code !== undefined &&
        content.code !== filter.content_code
      ) {
        return false;
      }
      if (
        filter.content_type !== undefined &&
        content.type !== filter.content_type
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * @description Looks up a single map by id from the in-memory snapshot.
   */
  findMapById(mapId: number): MapSchema | undefined {
    return this.allMaps.find((map) => map.map_id === mapId);
  }

  /**
   * @description Remove an item from the itemsToKeep list
   */
  removeItemFromItemsToKeep(itemCode: string) {
    if (!this.itemsToKeep) {
      // Hacky fix for undefined itemsToKeep
      this.itemsToKeep = [];
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
    if (!this.itemsToKeep) {
      // Hacky fix for undefined itemsToKeep
      this.itemsToKeep = [];
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
    const charLevel = this.getCharacterLevel(this.data);
    const minPotionLevel = utilityType === 'restore' ? charLevel - 20 : 0;

    for (const potion of [...utility].reverse()) {
      logger.debug(`Evaluating ${potion.code}`);
      if (potion.level <= charLevel && potion.level >= minPotionLevel) {
        let numNeeded: number;
        if (slot === 'utility1') {
          numNeeded = MaxEquippedUtilities - this.data.utility1_slot_quantity;
        } else {
          numNeeded = MaxEquippedUtilities - this.data.utility2_slot_quantity;
        }

        const numInInv = this.checkQuantityOfItemInInv(potion.code);

        logger.debug(`Attempting to equip ${potion.name}`);
        if (numInInv >= numNeeded) {
          logger.debug(`Carrying ${numInInv} in inv. Equipping them`);
          await this.equipNow(potion.code, slot, numNeeded);
          return true;
        } else if (numInInv > 0 && numInInv < numNeeded) {
          logger.debug(
            `Carrying ${numInInv} in inv. Equipping them and checking bank`,
          );
          await this.equipNow(potion.code, slot, numInInv);
          numNeeded = numNeeded - numInInv;
          logger.debug(`${numNeeded} needed from the bank`);
        }
        const numInBank = await this.checkQuantityOfItemInBank(potion.code);
        if (numInBank > 0) {
          await this.withdrawNow(Math.min(numInBank, numNeeded), potion.code);
          await this.equipNow(
            potion.code,
            slot,
            Math.min(numInBank, numNeeded),
          );
          return true;
        } else if (
          potion.level <= this.getCharacterLevel(this.data, 'alchemy')
        ) {
          logger.debug(`Can't find any ${potion.name}. Crafting`);
          if (await this.craftNow(numNeeded, potion.code)) {
            return await this.equipNow(potion.code, slot, numNeeded);
          } else {
            logger.debug(`Can't craft ${potion.name}. Trying next best option`);
            continue;
          }
        } else {
          logger.debug(`Can't find any ${potion.name}`);
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
        MaxEquippedUtilities - this.data.utility2_slot_quantity;

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
        DesiredFoodCount - currentQuantity,
      );

      if (numNeeded > 0) {
        logger.info(
          `Topping up ${bestFood.code}: withdrawing ${numNeeded} from bank (currently have ${currentQuantity} in inventory)`,
        );
        await this.withdrawNow(numNeeded, bestFood.code);
      } else {
        logger.debug(
          `Already have enough ${bestFood.code} in inventory (${currentQuantity}/${DesiredFoodCount})`,
        );
      }
    } else {
      // Food is already in inventory, check if we need more
      const currentQuantity = this.checkQuantityOfItemInInv(bestFood.code);
      if (currentQuantity < DesiredFoodCount) {
        logger.debug(
          `Have ${currentQuantity} ${bestFood.code} in inventory, desired ${DesiredFoodCount}`,
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

  async tradeWithTasksMaster(
    itemCode: string,
    numToGather: number,
  ): Promise<boolean> {
    logger.debug(`Handing in ${numToGather} ${itemCode}`);
    const maps = this.findMaps({
      content_code: 'items',
      content_type: 'tasks_master',
    });
    if (maps.length === 0) {
      logger.error(`Cannot find the items tasks master`);
      return false;
    }
    await this.move(this.evaluateClosestMap(maps));

    const taskTradeResponse: ApiError | TaskTradeResponseSchema =
      await actionTasksTrade(this.data, {
        code: itemCode,
        quantity: numToGather,
      });
    if (taskTradeResponse instanceof ApiError) {
      logger.warn(taskTradeResponse.message);
      return this.handleErrors(taskTradeResponse);
    } else {
      if (taskTradeResponse.data.character) {
        this.data = taskTradeResponse.data.character;
      } else {
        logger.error('Task trade response missing character data');
        return false;
      }
      return true;
    }
  }

  async completeTask(taskType: TaskType): Promise<boolean> {
    const maps = this.findMaps({
      content_code: taskType,
      content_type: 'tasks_master',
    });
    if (maps.length === 0) {
      logger.error(`Cannot find the tasks master`);
      return false;
    }
    const tasksLocation = this.evaluateClosestMap(maps);
    await this.move(tasksLocation);
    let response = await actionCompleteTask(this.data);
    if (response instanceof ApiError && response.error.code === 497) {
      // Inventory full — deposit items to make space for the task reward, then retry
      const shouldRetry = await this.handleErrors(response);
      if (!shouldRetry) return false;
      await this.move(tasksLocation);
      response = await actionCompleteTask(this.data);
    }
    if (response instanceof ApiError) return this.handleErrors(response);
    if (response.data.character) this.data = response.data.character;
    return true;
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
   */
  async evaluateDepositItemsInBank(
    exceptions?: string[],
    priorLocation?: MapSchema,
    makeSpaceForOtherItems?: boolean,
  ): Promise<boolean> {
    const usedInventorySpace = this.getInventoryFullness();
    // getInventoryFullness() returns a percentage (0-100), so 95 here means 95% full
    if (usedInventorySpace >= 95 || makeSpaceForOtherItems) {
      logger.warn(`Inventory is almost full. Depositing all items`);
      // Quick hack to prevent panics. No clue why it's not
      if (!this.itemsToKeep) {
        this.itemsToKeep = [];
      }
      for (const item of this.itemsToKeep) {
        logger.info(`Items to keep:`);
        logger.info(`  - ${item}`);
      }
      const maps = await this.getAvailableBanks();

      logger.debug(`Banks available:`);
      maps.forEach((map) =>
        logger.debug(`  - ${map.name} (ID: ${map.map_id})`),
      );

      const contentLocation = this.evaluateClosestMap(maps);

      logger.debug(``);

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
        // Already at the bank, so shed any gold above the carry cap before leaving
        await this.depositExcessGold();
        if (priorLocation) {
          logger.debug(
            `Moving to prior location ${priorLocation.map_id} (x: ${priorLocation.x}, y: ${priorLocation.y})`,
          );
          await this.move(priorLocation);
        }
      }
      return true;
    }
    return false;
  }

  /**
   * @description The maximum gold a character will keep on hand. Anything above
   * this gets banked. Single source of truth for the gold carry cap.
   */
  get goldCarryCap(): number {
    return this.data.level * 3000;
  }

  /**
   * @description How much gold the character is holding above the carry cap
   * (0 if at or below the cap).
   */
  get excessGold(): number {
    return Math.max(0, this.data.gold - this.goldCarryCap);
  }

  /**
   * @description Deposits any gold held above the carry cap into the bank.
   * Assumes the character is already at the bank — it calls the deposit action
   * directly rather than queuing a DepositObjective, so it only makes sense to
   * call this once already at the bank (e.g. straight after depositing items).
   * @returns true if excess gold was deposited, false if there was nothing to deposit
   */
  private async depositExcessGold(): Promise<boolean> {
    const excessGold = this.excessGold;

    if (excessGold <= 0) {
      return false;
    }

    logger.info(
      `Depositing ${excessGold} excess gold (carry cap is ${this.goldCarryCap})`,
    );
    const response = await actionDepositGold(this.data, excessGold);

    if (response instanceof ApiError) {
      this.handleErrors(response);
      return false;
    }

    if (response.data.character) {
      this.data = response.data.character;
    } else {
      logger.error('Deposit gold response missing character data');
    }
    return true;
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
      if (food.quantity > MinFood) {
        logger.debug(
          `Found ${food.quantity} ${food.code} in inventory (min: ${MinFood})`,
        );
        return true;
      }
    }

    logger.debug(
      `No food in inventory meets minimum requirements (${MinFood})`,
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
      if (food.quantity >= MinFood) {
        logger.debug(
          `Have sufficient ${food.code} in inventory (${food.quantity}/${MinFood})`,
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
        MinFood,
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
      `Not enough ${bestFood.code} in inventory (${bestFood.quantity}/${MinFood})`,
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
      logger.warn(`No data found in findFoodInInventory`);
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
          itemInfo.level <= this.data.level
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
          itemInfo.level <= this.data.level
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
      const bestFood = inventoryFood.toSorted(
        (a, b) => b.healValue - a.healValue,
      )[0];
      logger.debug(`Found ${bestFood.code} as best food in inventory`);
      return { ...bestFood, source: 'inventory' };
    }

    // If no food in inventory, check bank
    const bankFood = await this.findFoodInBank();

    if (bankFood.length > 0) {
      // Prefer cheese or fish_soup over anything else if we have it for the achievements
      // ToDo: Only do this if we need to complete the achievement
      const achievementFoods = bankFood.find(
        (food) =>
          food.code === 'cheese' ||
          food.code === 'fish_soup' ||
          food.code === 'mushroom_soup' ||
          food.code === 'apple_pie',
      );
      if (achievementFoods) {
        logger.debug(
          `Found ${achievementFoods.code} as best food in inventory (achievement food)`,
        );

        return {
          ...achievementFoods,
          source: 'bank',
        };
      } else {
        // Sort by heal value (descending) and return the best one
        const bestFood = bankFood.sort((a, b) => b.healValue - a.healValue)[0];
        logger.debug(`Found ${bestFood.code} as best food in bank`);

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
   * @description Moves the character to the destination, automatically routing through any
   * required transition points along the way.
   */
  async move(destination: MapSchema): Promise<boolean> {
    if (
      (this.data.x === destination.x && this.data.y === destination.y) ||
      this.data.map_id === destination.map_id
    ) {
      return true;
    }

    // Same-zone moves need no transitions, so skip the (bank-touching) satisfiability scan.
    const startZone = this.navigationGraph.zoneOfMapId.get(this.data.map_id);
    const targetZone = this.navigationGraph.zoneOfMapId.get(destination.map_id);
    const sameZone = startZone !== undefined && startZone === targetZone;

    // Transitions whose conditions the character cannot currently satisfy — the pathfinder
    // never routes through a gate it can't pass (e.g. a key it doesn't hold). Recomputed
    // after a successful acquisition, since newly-held items make gates passable.
    let unsatisfiableTransitionIds = sameZone
      ? new Set<number>()
      : await this.computeUnsatisfiableTransitions();
    // Transitions the game reported unreachable (595) during this move.
    const blockedTransitionIds = new Set<number>();
    let attemptedAcquisition = false;
    const MAX_REROUTES = 3;

    for (let attempt = 0; attempt <= MAX_REROUTES; attempt++) {
      const excludedTransitionIds = new Set<number>([
        ...unsatisfiableTransitionIds,
        ...blockedTransitionIds,
      ]);
      const transitionPath = buildTransitionPath(
        this.data.map_id,
        destination,
        this.navigationGraph,
        excludedTransitionIds,
      );

      if (transitionPath === null) {
        // Last resort: if the only thing blocking us is item requirements we don't hold,
        // go and acquire them, then retry. Guarded so acquisition can't recurse into itself
        // (gather/craft/buy sub-jobs call move() again), and attempted at most once.
        if (
          !this.acquiringForTransition &&
          !attemptedAcquisition &&
          !sameZone
        ) {
          attemptedAcquisition = true;
          const acquireExcluded = new Set<number>([
            ...(await this.computeUnacquirableTransitions()),
            ...blockedTransitionIds,
          ]);
          const acquirePath = buildTransitionPath(
            this.data.map_id,
            destination,
            this.navigationGraph,
            acquireExcluded,
          );
          if (
            acquirePath &&
            (await this.acquireRequirementsForPath(acquirePath))
          ) {
            unsatisfiableTransitionIds =
              await this.computeUnsatisfiableTransitions();
            continue;
          }
        }
        logger.error(
          `Failed to build transition path to ${destination.name} (${destination.x}, ${destination.y}, ${destination.layer})`,
        );
        return false;
      }

      let blockedTransitionId: number | null = null;
      let stepFailed = false;
      for (const transitionPoint of transitionPath) {
        const result = await this.performTransitionStep(transitionPoint);
        if (!result.ok) {
          stepFailed = true;
          if (result.reroute) blockedTransitionId = transitionPoint.map_id;
          break;
        }
      }

      if (stepFailed) {
        if (blockedTransitionId === null) return false;
        blockedTransitionIds.add(blockedTransitionId);
        logger.warn(
          `No path to transition ${blockedTransitionId}; rerouting to ${destination.name} (attempt ${attempt + 1}/${MAX_REROUTES})`,
        );
        continue;
      }

      logger.info(
        `Moving to ${destination.name} (id: ${destination.map_id}, x: ${destination.x}, y: ${destination.y})`,
      );

      const moveResponse = await actionMove(this.data, {
        x: destination.x,
        y: destination.y,
      });

      if (moveResponse instanceof ApiError) {
        // The final hop can also be blocked (595) when the last transition landed us in a region
        // not connected to the destination. Exclude that transition and try another route.
        if (moveResponse.error.code === 595 && transitionPath.length > 0) {
          const lastTransitionId =
            transitionPath[transitionPath.length - 1].map_id;
          blockedTransitionIds.add(lastTransitionId);
          logger.warn(
            `No path from landing point to ${destination.name} [Code: 595]; rerouting (attempt ${attempt + 1}/${MAX_REROUTES})`,
          );
          continue;
        }
        return this.handleErrors(moveResponse);
      }
      if (moveResponse.data.character) {
        this.data = moveResponse.data.character;
        return true;
      }
      logger.error('Move response missing character data');
      return false;
    }

    logger.error(
      `Exhausted reroute attempts (${MAX_REROUTES}) trying to reach ${destination.name}`,
    );
    return false;
  }

  /**
   * @description The id of the mainland overworld zone — the zone containing the
   * spawn tile at (0, 0). Resolved once from the navigation graph and cached.
   * Returns undefined if the spawn tile or its zone can't be found (recall is then
   * simply skipped). Used to decide when a recall potion is worthwhile.
   */
  private getMainlandZoneId(): number | undefined {
    if (this.mainlandZoneId !== undefined) return this.mainlandZoneId;
    if (!this.allMaps) return undefined;
    const spawn = this.allMaps.find(
      (m) => m.x === 0 && m.y === 0 && m.layer === MapLayer.overworld,
    );
    if (!spawn) {
      logger.warn(
        'Could not find spawn tile (0,0) overworld; recall shortcut disabled',
      );
      return undefined;
    }
    this.mainlandZoneId = this.navigationGraph.zoneOfMapId.get(spawn.map_id);
    return this.mainlandZoneId;
  }

  /**
   * @description If a transition is an overworld→overworld hop into the mainland zone
   * and the character holds a recall (or forest bank) potion, use the potion to teleport
   * to the mainland instead of taking the boat — saving the trip and its gold cost.
   * Returns the step result when it handled the step, or null to fall through to the
   * normal transition (no potion, not a mainland-bound overworld hop, or use failed).
   */
  private async tryRecallToMainland(
    transitionPoint: MapSchema,
  ): Promise<TransitionStepResult | null> {
    const transition = transitionPoint.interactions.transition;
    if (
      !transition ||
      transitionPoint.layer !== MapLayer.overworld ||
      transition.layer !== MapLayer.overworld
    ) {
      return null;
    }

    const mainlandZoneId = this.getMainlandZoneId();
    const destZoneId = this.navigationGraph.zoneOfMapId.get(transition.map_id);
    if (mainlandZoneId === undefined || destZoneId !== mainlandZoneId) {
      return null;
    }

    const potion =
      this.checkQuantityOfItemInInv(RecallPotion) > 0
        ? RecallPotion
        : this.checkQuantityOfItemInInv(ForestBankPotion) > 0
          ? ForestBankPotion
          : null;
    if (!potion) return null;

    logger.info(
      `Using ${potion} to recall to the mainland instead of the boat`,
    );
    if (await this.useItem(potion, 1)) return { ok: true };
    // Use failed — fall through to the normal transition route.
    return null;
  }

  /**
   * @description Moves to a transition point and executes the transition.
   * Ensures every transition condition is met first (withdrawing the shortfall of
   * a gold/item cost or required item from the bank). If a condition can't be met,
   * reroutes so move() tries another exit.
   */
  private async performTransitionStep(
    transitionPoint: MapSchema,
  ): Promise<TransitionStepResult> {
    const transition = transitionPoint.interactions.transition;
    if (!transition) {
      logger.error(
        `Map ${transitionPoint.map_id} at (${transitionPoint.x}, ${transitionPoint.y}) has no transition data`,
      );
      return { ok: false, reroute: false };
    }

    // Shortcut: if this overworld transition leads to the mainland and we hold a
    // teleport potion, recall instead of taking the (slower, gold-costing) boat.
    const recallResult = await this.tryRecallToMainland(transitionPoint);
    if (recallResult) return recallResult;

    if (transition.conditions) {
      for (const condition of transition.conditions) {
        if (!(await this.ensureTransitionCondition(condition))) {
          logger.warn(
            `Could not satisfy transition condition at (${transitionPoint.x}, ${transitionPoint.y}): ${JSON.stringify(condition)} — rerouting`,
          );
          return { ok: false, reroute: true };
        }
      }
    }

    logger.info(
      `Moving to transition point at (${transitionPoint.x}, ${transitionPoint.y}, ${transitionPoint.layer})`,
    );

    if (
      this.data.x !== transitionPoint.x ||
      this.data.y !== transitionPoint.y
    ) {
      const moveResponse = await actionMove(this.data, {
        x: transitionPoint.x,
        y: transitionPoint.y,
      });
      if (moveResponse instanceof ApiError) {
        // 595 = the game found no walkable path to this transition tile. Signal a reroute so
        // move() can exclude this transition and try a different exit.
        if (moveResponse.error.code === 595) {
          logger.warn(
            `No path to transition point (${transitionPoint.x}, ${transitionPoint.y}, ${transitionPoint.layer}) [Code: 595]`,
          );
          return { ok: false, reroute: true };
        }
        await this.handleErrors(moveResponse);
        return { ok: false, reroute: false };
      }
      if (!moveResponse.data.character) {
        logger.error('Move response missing character data');
        return { ok: false, reroute: false };
      }
      this.data = moveResponse.data.character;
    }

    return (await this.transition())
      ? { ok: true }
      : { ok: false, reroute: false };
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
      if (useResponse.data && useResponse.data.character) {
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

  async evaluateGear(
    activityType: WeaponFlavours,
    targetMob?: string,
    targetResource?: string,
  ) {
    const evaluateGearJob = new EvaluateGearObjective(
      this,
      activityType,
      targetMob,
      targetResource,
    );

    return await this.executeJobNow(
      evaluateGearJob,
      true,
      true,
      this.currentExecutingJob?.objectiveId,
    );
  }

  async proposeCombatLoadout(targetMob: string): Promise<FakeCharacterSchema> {
    const job = new EvaluateGearObjective(this, 'combat', targetMob);
    const charLevel = this.getCharacterLevel(this.data);
    return await job.proposeCombatLoadout(charLevel, targetMob);
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

  /********
   * Database interactions
   */

  /**
   * @description Update the acquisitions table with purchase details
   */
  async updateAcquisitionsTable(category: string, itemCode: string) {
    // We use placeholders ($1, $2, $3) to keep the query secure.
    // 'acquired_at' will default to NOW() automatically based on your schema.
    const dbQuery = `
      INSERT INTO acquisitions (category, item_code, character)
      VALUES ($1, $2, $3);
    `;

    try {
      const characterName = this.data.name;

      // Pass the variables safely in the parameters array
      await db.query(dbQuery, [category, itemCode, characterName]);

      console.log(`Successfully recorded ${itemCode} for ${characterName}`);
    } catch (error) {
      console.error(`Failed to record acquisition for ${itemCode}:`, error);
      throw error;
    }
  }

  /**
   * @description Check the acquisitions table to see if any character has already bought this tool
   */
  async checkAcquisitionsTable(itemCode: string): Promise<boolean> {
    const dbQuery = `
      SELECT EXISTS (
        SELECT 1 
        FROM acquisitions 
        WHERE item_code = $1
      ) AS "hasBeenBought";
    `;

    try {
      const result = await db.query(dbQuery, [itemCode]);

      return result.rows[0].hasBeenBought;
    } catch (error) {
      console.error(
        `Failed to check acquisitions for item ${itemCode}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * @description Total gold the character can draw on right now: gold on the
   * character plus gold in the bank. Bank read failures count as 0.
   */
  private async getBankGold(): Promise<number> {
    const details = await getBankDetails();
    if (details instanceof ApiError) {
      logger.warn('Failed to read bank gold; treating bank gold as 0');
      return 0;
    }
    return details.data.gold;
  }

  /**
   * @description Returns true if the character can currently satisfy every access
   * or transition condition. "Currently" includes resources in the bank (which can
   * be withdrawn), not resources it would have to go and acquire/craft.
   *
   * - achievement_unlocked: the achievement is completed
   * - has_item: the item is equipped, or held in inventory + bank (>= value, default 1)
   * - cost (gold): on-hand gold + bank gold >= value
   * - cost (item): inventory + bank >= value
   * - any other operator (eq/ne/gt/lt/unknown): treated as satisfiable; the
   *   transition/move API remains the source of truth and move()'s reroute loop
   *   recovers if it turns out to be unusable.
   */
  async canSatisfyConditions(
    conditions: ConditionSchema[] | null | undefined,
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) return true;
    for (const condition of conditions) {
      if (!(await this.canSatisfyCondition(condition))) return false;
    }
    return true;
  }

  private async canSatisfyCondition(
    condition: ConditionSchema,
  ): Promise<boolean> {
    switch (condition.operator) {
      case ConditionOperator.achievement_unlocked:
        return this.completedAchievements.some(
          (achievement) => achievement.code === condition.code,
        );

      case ConditionOperator.has_item: {
        const required = condition.value || 1;
        if (this.hasEquipped(condition.code)) return true;
        const onHand = this.checkQuantityOfItemInInv(condition.code);
        if (onHand >= required) return true;
        const inBank = await this.checkQuantityOfItemInBank(condition.code);
        return onHand + inBank >= required;
      }

      case ConditionOperator.cost: {
        if (condition.code === 'gold') {
          if (this.data.gold >= condition.value) return true;
          const bankGold = await this.getBankGold();
          return this.data.gold + bankGold >= condition.value;
        }
        const onHand = this.checkQuantityOfItemInInv(condition.code);
        if (onHand >= condition.value) return true;
        const inBank = await this.checkQuantityOfItemInBank(condition.code);
        return onHand + inBank >= condition.value;
      }

      default:
        // eq/ne/gt/lt and anything we don't model: stay permissive so we don't
        // wrongly prune a route. The API + reroute loop catch real failures.
        return true;
    }
  }

  /**
   * @description Returns the set of transition-point map_ids whose conditions the
   * character cannot currently satisfy. move() seeds its excluded-transition set
   * with this so the pathfinder never routes through a gate it can't pass.
   * Transitions without conditions are skipped (the common case).
   */
  async computeUnsatisfiableTransitions(): Promise<Set<number>> {
    const unsatisfiable = new Set<number>();
    for (const edges of this.navigationGraph.edges.values()) {
      for (const edge of edges) {
        const conditions =
          edge.transitionPoint.interactions.transition?.conditions;
        if (!conditions || conditions.length === 0) continue;
        if (!(await this.canSatisfyConditions(conditions))) {
          unsatisfiable.add(edge.transitionPoint.map_id);
        }
      }
    }
    return unsatisfiable;
  }

  /**
   * @description Returns the set of transition-point map_ids that the character can
   * neither satisfy now nor acquire its way through. A condition is acquirable when it
   * is an item (has_item or a non-gold cost) — those can be gathered/crafted/bought. An
   * unmet gold cost (no way to earn gold) or an unmet achievement makes the transition
   * unacquirable. move()'s last-resort acquisition excludes these.
   */
  async computeUnacquirableTransitions(): Promise<Set<number>> {
    const unacquirable = new Set<number>();
    for (const edges of this.navigationGraph.edges.values()) {
      for (const edge of edges) {
        const conditions =
          edge.transitionPoint.interactions.transition?.conditions;
        if (!conditions || conditions.length === 0) continue;
        for (const condition of conditions) {
          const isAcquirableItem =
            condition.operator === ConditionOperator.has_item ||
            (condition.operator === ConditionOperator.cost &&
              condition.code !== 'gold');
          if (isAcquirableItem) continue;
          // Gold cost / achievement / anything else: only OK if already satisfiable.
          if (!(await this.canSatisfyCondition(condition))) {
            unacquirable.add(edge.transitionPoint.map_id);
            break;
          }
        }
      }
    }
    return unacquirable;
  }

  /**
   * @description Makes sure a single transition condition is met before transitioning,
   * withdrawing the shortfall of a gold/item cost or a required has_item from the bank.
   * The /transition call itself consumes any `cost`. Returns false when the condition
   * cannot be met so the caller can reroute.
   */
  private async ensureTransitionCondition(
    condition: ConditionSchema,
  ): Promise<boolean> {
    switch (condition.operator) {
      case ConditionOperator.achievement_unlocked:
        return this.completedAchievements.some(
          (achievement) => achievement.code === condition.code,
        );

      case ConditionOperator.has_item: {
        const required = condition.value || 1;
        if (this.hasEquipped(condition.code)) return true;
        const onHand = this.checkQuantityOfItemInInv(condition.code);
        if (onHand >= required) return true;
        return await this.withdrawNow(required - onHand, condition.code);
      }

      case ConditionOperator.cost: {
        const onHand =
          condition.code === 'gold'
            ? this.data.gold
            : this.checkQuantityOfItemInInv(condition.code);
        if (onHand >= condition.value) return true;
        return await this.withdrawNow(condition.value - onHand, condition.code);
      }

      default:
        // Unmodelled operator (eq/ne/gt/lt): nothing to withdraw; let the
        // /transition API enforce it.
        return true;
    }
  }

  /**
   * @description Acquires the item requirements of every gated transition on a route so it
   * becomes passable. Only item conditions (has_item / non-gold cost) are acquired — the
   * caller guarantees the route contains no unacquirable (gold/achievement) gates. Sets the
   * acquiringForTransition guard so the gather/craft/buy sub-jobs (which call move()) don't
   * recurse back into acquisition. Returns false if any required item can't be obtained.
   */
  private async acquireRequirementsForPath(
    path: MapSchema[],
  ): Promise<boolean> {
    const wasAcquiring = this.acquiringForTransition;
    this.acquiringForTransition = true;
    try {
      for (const transitionPoint of path) {
        const conditions = transitionPoint.interactions.transition?.conditions;
        if (!conditions) continue;
        for (const condition of conditions) {
          if (await this.canSatisfyCondition(condition)) continue;
          const required = condition.value || 1;
          logger.info(
            `Acquiring ${required}x ${condition.code} to pass transition at (${transitionPoint.x}, ${transitionPoint.y})`,
          );
          if (!(await this.gatherNow(required, condition.code, true, true))) {
            logger.warn(
              `Could not acquire ${condition.code}; abandoning route`,
            );
            return false;
          }
        }
      }
      return true;
    } finally {
      this.acquiringForTransition = wasAcquiring;
    }
  }

  /**
   * @description Gets the available banks. Filters out banks that are locked by achievements
   */
  async getAvailableBanks(): Promise<MapSchema[]> {
    const maps = this.findMaps({ content_type: 'bank' });

    // Filter maps dynamically based on whether the character can satisfy their
    // access conditions (achievements, held items, affordable gold/item costs).
    const availableMaps: MapSchema[] = [];
    for (const map of maps) {
      if (
        map.access.type === 'standard' ||
        (await this.canSatisfyConditions(map.access.conditions))
      ) {
        availableMaps.push(map);
      }
    }

    return availableMaps;
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
        // The character's inventory is full.
        // If the char is doing a task then we should hand in the items if they have
        // before emptying the remaining inventory into the bank
        if (this.data.task && this.data.task_type === 'items') {
          const numInInv = this.checkQuantityOfItemInInv(this.data.task);
          if (numInInv > 0) {
            const numLeftToHandIn =
              this.data.task_total - this.data.task_progress;

            if (numLeftToHandIn > 0) {
              logger.info(
                `Found  item task resource (${this.data.task} x${numInInv}) in inventory. Attempting to hand in ${Math.min(numLeftToHandIn, numInInv)} to clear up inv space`,
              );
              await this.tradeWithTasksMaster(
                this.data.task,
                Math.min(numLeftToHandIn, numInInv),
              );
            }

            logger.info(
              `Item task complete (${this.data.task_progress}/${this.data.task_total}). Depositing items to make space for task reward.`,
            );
          }
        }

        const mapData = this.findMapById(this.data.map_id);
        if (!mapData) {
          logger.error(`Failed to get current map data`);
          return false;
        }
        await this.evaluateDepositItemsInBank(this.itemsToKeep, mapData, true);
        return true;
      }
      case 499:
        await sleep(this.data.cooldown, 'cooldown');
        return true;
      case 500: // Bad gateway from server
      case 502: // Bad gateway from server
      case TRANSPORT_ERROR_CODE: // 599 Transport-level failure (network blip, dropped connection, bad body)
        logger.warn('Sleeping for 5 minutes to avoid 5xx errors');
        await sleep(300, 'HTTP error code 5xx');
        return true;
      case 595: // /action/move: no path available to the destination map
      case 596: // /action/move: the map is blocked and cannot be accessed
        // Routing is handled by move()'s reroute loop; nothing useful to do here.
        return false;
      case 598: // /action/crafting: workshop not found on this map
        return false;
      default:
        return false;
    }
  }
}
