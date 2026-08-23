import {
  actionClaimPendingItems,
  getPendingItems,
} from '../api_calls/Items.js';
import {
  FightPotionsToStock,
  MAX_SKILL_LEVEL,
  MinFightPotionsInBank,
  RestorePotionCraftBatch,
  RestorePotionStockTarget,
} from '../constants.js';
import {
  Restore,
  BoostDmgAir,
  BoostDmgEarth,
  BoostDmgFire,
  BoostDmgWater,
  BoostResAir,
  BoostResEarth,
  BoostResFire,
  BoostResWater,
} from '../names.js';
import { UtilityEffects } from '../types/ItemData.js';
import { Role } from '../types/CharacterData.js';
import {
  ItemSchema,
  Skill,
  StaticDataPageResourceSchema,
} from '../types/types.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
} from './idle.utils.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { BankCache } from '../core/BankCache.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

export class IdleHealerObjective extends Objective {
  role: Role;

  constructor(character: Character) {
    super(character, `idle_healer_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'healer';
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<ObjectiveResult> {
    let startTime = Date.now();

    await completeTasksFarmerAchievement(this.character, this.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWishlistToFulfill(this.character, 'alchemy', this.objectiveId);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpTeleportPotionsInBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpAntipoisonPotionsInBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpRestorePotionsInBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpFightPotionsInBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.topUpFishInBank();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkAndBuyArtifacts(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkOnHoldQueue(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    await checkWithinLevelRange(this.character);
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    // Train skills depending on their role
    // If the skill gets 5 levels ahead of their combat level then they won't train the skill any further
    // There's no need for skills to get too far ahead of combat level
    if (
      this.character.getCharacterLevel(this.character.data, 'alchemy') <=
      this.character.getCharacterLevel(this.character.data) + 5
    ) {
      await this.trainSkill('alchemy');
    } else {
      await this.trainSkill('fishing');
    }
    if (this.checkIdleJobIsLast()) return ObjectiveCancelled;

    if (Date.now() - startTime > 10 * 60 * 1000) {
      logger.info(
        `Idle job has been running for more than 10 minutes. Ending it to see if there's something we need to do`,
      );
      return ObjectiveCompleted;
    } else {
      // If the idle job hasn't really triggered any other jobs, we want to top up craft some extra potions
      await this.topUpRestorePotionsInBank();
    }

    return ObjectiveCompleted;
  }

  /**
   * @description The healer also needs to train their fishing skill for algae etc for potions
   * This means that they can also help with stocking up fish in the bank. Their role doesn't
   * include cooking so they will put raw fish in the bank, leaving the cooking up to the fisherman
   * If there isn't enough of a certain fish in the bank, this char will retrieve an inventory load only.
   * Their priority is potions with fish as a secondary so we don't want to focus on fish too much
   */
  private async topUpFishInBank(): Promise<boolean> {
    const minimumFoodInBank = 500;

    for (const cookedFish of this.character.consumablesMap['heal'].filter(
      (consumable) =>
        consumable.craft?.skill === 'cooking' &&
        consumable.craft.items.some((ingredient) =>
          this.character.fishingDropCodes.has(ingredient.code),
        ),
    )) {
      if (
        cookedFish.craft.level <
          this.character.getCharacterLevel(this.character.data, 'fishing') &&
        cookedFish.craft.level <= this.character.highestCharLevel &&
        cookedFish.craft.level >= this.character.lowestCharLevel - 9
      ) {
        const numInBank = await this.character.checkQuantityOfItemInBank(
          cookedFish.code,
        );
        if (cookedFish.craft.items.length === 1) {
          if (numInBank < minimumFoodInBank) {
            const numToGather = Math.round(
              this.character.data.inventory_max_items * 0.95,
            );
            const fishToGather = cookedFish.craft.items[0].code;
            await this.character.gatherNow(numToGather, fishToGather);
            await this.character.depositNow(numToGather, fishToGather);
          }
        } else {
          logger.debug(
            `${cookedFish.code} requires more than 1 ingredient. Skipping`,
          );
        }
      }
    }
    return true;
  }

  /**
   * @description Helper function to check if there are any new jobs added to the queue
   * @returns true if there are other jobs in the queue, false if not
   */
  private checkIdleJobIsLast() {
    const jobs = this.character.jobList ?? [];
    const idleJobIndex = jobs.findIndex((job: Objective) =>
      job.objectiveId.startsWith('idle_'),
    );
    if (idleJobIndex === -1) {
      return false;
    }
    if (idleJobIndex !== jobs.length - 1) {
      return true;
    }
    return false;
  }

  /**
   * Checks for pending items and claims any that need claiming
   */
  private async claimPendingItems(): Promise<boolean> {
    const pendingItems = await getPendingItems();

    if (pendingItems instanceof ApiError) {
      return this.character.handleErrors(pendingItems);
    }

    const unclaimed = pendingItems.data.filter((item) => !item.claimed_at);

    if (unclaimed.length === 0) {
      logger.info(`No pending items to claim`);
      return true;
    }

    for (const pendingItem of unclaimed) {
      logger.info(
        `Claiming item ${pendingItem.description} from ${pendingItem.source}`,
      );
      const claimResponse = await actionClaimPendingItems(
        this.character.data,
        pendingItem.id,
      );
      if (claimResponse instanceof ApiError) {
        await this.character.handleErrors(claimResponse);
      }
    }
    return true;
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   */
  private async topUpRestorePotionsInBank(): Promise<ObjectiveResult> {
    const alchemyLevel = this.character.getCharacterLevel(
      this.character.data,
      'alchemy',
    );
    const restorePotions = this.character.utilitiesMap[Restore];

    const bankContents = await BankCache.create(this.character);
    if (bankContents.stale) {
      logger.warn(
        'Could not read the bank; skipping the restore potion top-up',
      );
      return ObjectiveFailed;
    }

    // Counted across tiers, the same way the boss fight reserve is counted, so
    // a bank full of one tier and a bank spread over three both read honestly
    const banked = restorePotions.reduce(
      (running, potion) => running + bankContents.quantityOf(potion.code),
      0,
    );

    if (banked >= RestorePotionStockTarget) {
      logger.info(
        `${banked} restore potions banked, at or above the ${RestorePotionStockTarget} target. Brewing none`,
      );
      return ObjectiveCompleted;
    }

    // Craft the best potion each character can actually use, so low-level
    // characters get low tiers and high-level characters get higher ones,
    // without wasting mats on tiers no character is stuck at.
    const tiersToCraft = await this.findBestPotionsToCraft(
      restorePotions,
      alchemyLevel,
    );

    for (const healingPotion of restorePotions) {
      if (!tiersToCraft.has(healingPotion.code)) {
        continue;
      }
      logger.info(
        `Crafting ${RestorePotionCraftBatch} ${healingPotion.code}; ${banked}/${RestorePotionStockTarget} restore potions banked`,
      );
      await this.character.craftNow(
        RestorePotionCraftBatch,
        healingPotion.code,
      );

      if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
    }

    return ObjectiveCompleted;
  }

  /**
   * Crafts numWantedInBank antipoison potions
   * We only want 50 in the bank at a time, no need to craft more than that
   * @returns
   */
  async topUpAntipoisonPotionsInBank(): Promise<ObjectiveResult> {
    const numWantedInBank = 50;

    const bankContents = await BankCache.create(this.character);

    if (bankContents.stale) {
      logger.warn(
        'Could not read the bank; skipping the teleport potion top-up',
      );
      return ObjectiveFailed;
    }

    for (const antiPoisonpotion of this.character.utilitiesMap['antipoison']) {
      const numInBank = bankContents.quantityOf(antiPoisonpotion.code);
      if (
        antiPoisonpotion.craft.level <
          this.character.getCharacterLevel(this.character.data, 'alchemy') &&
        antiPoisonpotion.craft.level <= this.character.highestCharLevel &&
        numInBank < numWantedInBank
      ) {
        await this.character.craftNow(numWantedInBank, antiPoisonpotion.code);
      }
    }

    return ObjectiveCompleted;
  }

  /**
   * Figure out the best potion to craft
   */
  private async findBestPotionsToCraft(
    restorePotions: ItemSchema[],
    alchemyLevel: number,
  ): Promise<Set<string>> {
    let tiersToCraft = new Set<string>();

    for (const char of this.character.allCharacterDetails ?? []) {
      let best: ItemSchema | undefined;
      for (const potion of restorePotions) {
        if (
          potion.craft.level <= alchemyLevel &&
          potion.level <= char.level &&
          (best === undefined || potion.level > best.level)
        ) {
          best = potion;
        }
      }

      if (best) {
        tiersToCraft.add(best.code);
      }
    }

    return tiersToCraft;
  }

  /**
   * @todo Create a TopUpBank objective that handles this
   * @returns
   */
  /**
   * @description Keeps a stock of damage boost and resistance potions in the
   * bank for the fighters to draw on.
   *
   * Unlike restores, these are stocked per element rather than per character
   * level: which one a fighter wants is decided by the monster it is facing,
   * not by how high level the fighter is. Every tier the alchemist can craft is
   * kept, not just the best one, so a fighter still has something to reach for
   * once the top tier runs out.
   */
  private async topUpFightPotionsInBank(): Promise<ObjectiveResult> {
    const effects: UtilityEffects[] = [
      BoostDmgAir,
      BoostDmgEarth,
      BoostDmgFire,
      BoostDmgWater,
      BoostResAir,
      BoostResEarth,
      BoostResFire,
      BoostResWater,
    ];

    const alchemyLevel = this.character.getCharacterLevel(
      this.character.data,
      'alchemy',
    );
    const highestCharLevel = Math.max(
      ...(this.character.allCharacterDetails ?? [this.character.data]).map(
        (char) => char.level,
      ),
    );

    const bankContents = await BankCache.create(this.character);
    if (bankContents.stale) {
      logger.warn('Could not read the bank; skipping the fight potion top-up');
      return ObjectiveFailed;
    }

    // enhanced_boost_potion carries all four damage effects, so it turns up
    // once per element. Crafting it four times over would be four times the mats
    const alreadyConsidered = new Set<string>();

    for (const effect of effects) {
      for (const potion of this.character.utilitiesMap[effect]) {
        if (alreadyConsidered.has(potion.code)) {
          continue;
        }
        alreadyConsidered.add(potion.code);

        // No point stocking a tier the alchemist cannot make or no fighter can
        // drink
        if (
          potion.craft?.level > alchemyLevel ||
          potion.level > highestCharLevel
        ) {
          continue;
        }

        const numInBank = bankContents.quantityOf(potion.code);
        if (numInBank >= MinFightPotionsInBank) {
          logger.debug(`${numInBank} ${potion.code} in the bank already`);
          continue;
        }

        const potsToCraft = FightPotionsToStock - numInBank;
        logger.info(
          `Crafting ${potsToCraft} ${potion.code} to bring the bank up to ${FightPotionsToStock}`,
        );
        await this.character.craftNow(potsToCraft, potion.code);

        if (this.checkIdleJobIsLast()) return ObjectiveCancelled;
      }
    }

    return ObjectiveCompleted;
  }

  private async topUpTeleportPotionsInBank(): Promise<boolean> {
    const maxPotionsToCraft = 100;
    const minPotionsInBank = 50;
    const alchemyLevel = this.character.getCharacterLevel(
      this.character.data,
      'alchemy',
    );

    const bankContents = await BankCache.create(this.character);

    if (bankContents.stale) {
      logger.warn(
        'Could not read the bank; skipping the teleport potion top-up',
      );
      return false;
    }

    const teleportPotions = this.character.consumablesMap['teleport'];

    for (const potion of teleportPotions) {
      const numInBank = bankContents.quantityOf(potion.code);

      if (potion.level <= alchemyLevel && numInBank < minPotionsInBank) {
        const potsToCraft = maxPotionsToCraft - numInBank;
        logger.info(`Crafting ${potsToCraft} ${potion.code}`);
        await this.character.craftNow(potsToCraft, potion.code);
      }
    }

    return true;
  }

  /**
   * For the healer, we'd like them to level up alchemy and fishing
   * For fishing, we want them to grab an inventory full at a time, before checking
   * if potions need crafting etc. It's slower overall but means they prioritise
   * topping up potions
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill: Skill): Promise<ObjectiveResult> {
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    const maxLevelGap = 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
      );
      return ObjectiveCompleted;
    } else if (
      skillLevel >=
      this.character.getCharacterLevel(this.character.data) + maxLevelGap
    ) {
      logger.info(
        `${skill} level (${skillLevel}) is too far ahead of combat level (${this.character.getCharacterLevel(this.character.data)}). Not training ${skill}`,
      );
      return ObjectiveCancelled;
    }

    if (skill === 'fishing') {
      const resourceTypes: StaticDataPageResourceSchema | ApiError =
        await getAllResourceInformation({
          skill: skill,
          max_level: this.character.getCharacterLevel(
            this.character.data,
            skill,
          ),
        });
      if (resourceTypes instanceof ApiError) {
        await this.character.handleErrors(resourceTypes);
        return ObjectiveFailed;
      }

      let resourceToGather = resourceTypes.data.at(-1).drops[0].code;

      const numToGather = Math.round(
        this.character.data.inventory_max_items * 0.9,
      );
      await this.character.gatherNow(numToGather, resourceToGather, false);
      return await this.character.depositNow(numToGather, resourceToGather);
    } else {
      return await this.character.trainCraftingSkillNow(
        'alchemy',
        this.character.getCharacterLevel(this.character.data, skill) + 1,
      );
    }
  }
}
