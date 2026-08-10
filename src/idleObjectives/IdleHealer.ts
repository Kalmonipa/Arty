import {
  actionClaimPendingItems,
  getPendingItems,
} from '../api_calls/Items.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import { Role } from '../types/CharacterData.js';
import {
  ItemSchema,
  Skill,
  StaticDataPageResourceSchema,
} from '../types/types.js';
import {
  GetCharacterData,
  getHighestCharLevel,
  isGatheringSkill,
  logger,
} from '../utils.js';
import { Character } from '../character/CharacterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { TrainCraftingSkillObjective } from '../core/TrainCraftingSkillObjective.js';
import { TradeObjective } from '../core/TradeWithNPCObjective.js';
import { TrainGatheringSkillObjective } from '../core/TrainGatheringSkillObjective.js';
import {
  checkWithinLevelRange,
  checkOnHoldQueue,
  completeTasksFarmerAchievement,
  checkAndBuyArtifacts,
  checkWishlistToFulfill,
} from './idleUtils.js';
import { GatherObjective } from '../core/GatherObjective.js';
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

    await this.topUpPotionsInBank();
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
  private async topUpPotionsInBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minPotionsInBank = 500;

    // Alchemist should craft 200 of every usable health potion, the floor being the lowest character level
    // and the ceiling being either the alchemists alchemy level or the highest character level
    const alchemyLevel = this.character.getCharacterLevel(
      this.character.data,
      'alchemy',
    );
    const restorePotions = this.character.utilitiesMap['restore'];

    // Craft the best potion each character can actually use, so low-level
    // characters get low tiers and high-level characters get higher ones,
    // without wasting mats on tiers no character is stuck at.
    const tiersToCraft = await this.findBestPotionsToCraft(
      restorePotions,
      alchemyLevel,
    );

    for (const potion of restorePotions) {
      if (!tiersToCraft.has(potion.code)) {
        continue;
      }
      logger.info(`Crafting ${minPotionsInBank} ${potion.code}`);
      await this.character.craftNow(minPotionsInBank, potion.code);
    }

    for (const potion of this.character.utilitiesMap['antipoison']) {
      if (
        potion.craft.level <
          this.character.getCharacterLevel(this.character.data, 'alchemy') &&
        potion.craft.level <= this.character.highestCharLevel
      ) {
        // Craft minPotionsInBank and move on. Previously I had the commented code
        // but that meant the healer would be non-stop crafting and quite often not
        // break out of the while loop for weeks

        // let numInBank = await this.character.checkQuantityOfItemInBank(
        //   potion.code,
        // );
        //while (numInBank < minPotionsInBank) {
        await this.character.craftNow(minPotionsInBank, potion.code);

        //   numInBank = await this.character.checkQuantityOfItemInBank(
        //     potion.code,
        //   );
        // }
      }
    }

    return true;
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
  private async topUpTeleportPotionsInBank(): Promise<boolean> {
    const minPotionsToCraft = 50;
    const alchemyLevel = this.character.getCharacterLevel(
      this.character.data,
      'alchemy',
    );

    const bankContents = await BankCache.create(this.character);

    // Every code in a stale snapshot reads 0, which here would mean crafting a
    // full batch of every tier on top of whatever is already banked.
    if (bankContents.stale) {
      logger.warn(
        'Could not read the bank; skipping the teleport potion top-up',
      );
      return false;
    }

    const teleportPotions = this.character.consumablesMap['teleport'];

    for (const potion of teleportPotions) {
      const numInBank = bankContents.quantityOf(potion.code);

      if (potion.level <= alchemyLevel && numInBank < minPotionsToCraft) {
        logger.info(`Crafting ${minPotionsToCraft - numInBank} ${potion.code}`);
        await this.character.craftNow(
          minPotionsToCraft - numInBank,
          potion.code,
        );
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
