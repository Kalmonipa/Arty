import {
  actionClaimPendingItems,
  getPendingItems,
} from '../api_calls/Items.js';
import { getAllNpcItems } from '../api_calls/NPC.js';
import { MAX_SKILL_LEVEL } from '../constants.js';
import { Role } from '../types/CharacterData.js';
import { ItemSchema, Skill } from '../types/types.js';
import {
  GetCharacterData,
  getHighestCharLevel,
  isGatheringSkill,
  logger,
} from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { TrainCraftingSkillObjective } from './TrainCraftingSkillObjective.js';
import { TradeObjective } from './TradeWithNPCObjective.js';
import { TrainGatheringSkillObjective } from './TrainGatheringSkillObjective.js';

export class IdleHealerObjective extends Objective {
  role: Role;

  constructor(character: Character) {
    super(character, `idle_healer_objective`, 'not_started');

    this.character = character;
    this.jobFlavour = 'Idle';
    this.shouldEmitMetrics = true;
    this.metricLabel = 'healer';
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Goes through the list of tasks and does some clean up stuff
   * The type of task varies depending on the role of the character
   */
  async run(): Promise<boolean> {
    await this.completeTasksFarmerAchievement();
    if (this.checkIdleJobIsLast()) return true;

    await this.character.tidyUpBank(this.character.role);
    if (this.checkIdleJobIsLast()) return true;

    await this.depositGoldIntoBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpPotionsInBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.topUpFishInBank();
    if (this.checkIdleJobIsLast()) return true;

    await this.claimPendingItems();
    if (this.checkIdleJobIsLast()) return true;

    await this.checkAndBuyArtifacts();
    if (this.checkIdleJobIsLast()) return true;

    await this.checkWithinLevelRange();
    if (this.checkIdleJobIsLast()) return true;

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
    if (this.checkIdleJobIsLast()) return true;
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
            await this.character.gatherNow(
              Math.round(this.character.data.inventory_max_items * 0.95),
              cookedFish.craft.items[0].code,
            );
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

  private async checkAndBuyArtifacts(): Promise<void> {
    if (!this.character.artifactsMap) {
      logger.warn('checkAndBuyArtifacts: artifactsMap not built, skipping');
      return;
    }

    const charLevel = this.character.getCharacterLevel(this.character.data);

    for (const [, artifacts] of Object.entries(this.character.artifactsMap)) {
      const eligible = (artifacts as ItemSchema[]).filter(
        (a) => a.level <= charLevel,
      );
      if (eligible.length === 0) continue;

      const artifact = eligible.reduce((best, a) =>
        a.level > best.level ? a : best,
      );

      const equipped =
        this.character.getCharacterGearIn('artifact1') === artifact.code ||
        this.character.getCharacterGearIn('artifact2') === artifact.code ||
        this.character.getCharacterGearIn('artifact3') === artifact.code;
      const inInv = this.character.checkQuantityOfItemInInv(artifact.code);
      const inBank = await this.character.checkQuantityOfItemInBank(
        artifact.code,
      );

      if (equipped || inInv + inBank >= 1) continue;

      const npcResult = await getAllNpcItems({ code: artifact.code });
      if (npcResult instanceof ApiError || npcResult.data.length === 0) {
        logger.debug(
          `checkAndBuyArtifacts: no NPC sells ${artifact.code}, skipping`,
        );
        continue;
      }

      const validItems = npcResult.data.filter(
        (item) => item.buy_price != null,
      );
      if (validItems.length === 0) {
        logger.debug(
          `checkAndBuyArtifacts: no valid buy_price for ${artifact.code}, skipping`,
        );
        continue;
      }

      const cheapest = validItems.reduce((a, b) =>
        a.buy_price! < b.buy_price! ? a : b,
      );
      const { buy_price, currency } = cheapest;

      const currencyInInv = this.character.checkQuantityOfItemInInv(currency);
      const currencyInBank =
        await this.character.checkQuantityOfItemInBank(currency);

      if (currencyInInv + currencyInBank < buy_price!) {
        logger.debug(
          `checkAndBuyArtifacts: cannot afford ${artifact.code} (need ${buy_price} ${currency}), skipping`,
        );
        continue;
      }

      const bought = await this.character.executeJobNow(
        new TradeObjective(this.character, 'buy', 1, artifact.code),
      );
      if (!bought) {
        logger.warn(
          `checkAndBuyArtifacts: failed to buy ${artifact.code}, continuing`,
        );
        continue;
      }

      const deposited = await this.character.depositNow(1, artifact.code);
      if (!deposited) {
        logger.warn(
          `checkAndBuyArtifacts: failed to deposit ${artifact.code}, continuing`,
        );
      }
    }
  }

  /**
   * Looks at certain achievements to see if we can make progress towards any of them
   * I have a feeling this might be mostly hardcoding for specific achievements.
   * @returns true if successful, false if not
   */
  private checkAchievementProgress(): boolean {
    return true;
  }

  /**
   * Ensure that we have a minimum amount of certain items in the bank
   * - 200 Health potions of varying levels
   */
  private async topUpPotionsInBank(): Promise<boolean> {
    // The lowest amount of an item we'd like in the bank
    const minPotionsToCraft = 200;

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
    const tiersToCraft = new Set<string>();
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

    for (const potion of restorePotions) {
      if (!tiersToCraft.has(potion.code)) {
        continue;
      }
      const numInBank = await this.character.checkQuantityOfItemInBank(
        potion.code,
      );
      if (numInBank < minPotionsToCraft) {
        logger.info(`Crafting ${minPotionsToCraft - numInBank} ${potion.code}`);
        await this.character.craftNow(
          minPotionsToCraft - numInBank,
          potion.code,
        );
      }
    }

    for (const potion of this.character.utilitiesMap['antipoison']) {
      if (
        potion.craft.level <
          this.character.getCharacterLevel(this.character.data, 'alchemy') &&
        potion.craft.level <= this.character.highestCharLevel
      ) {
        const numInBank = await this.character.checkQuantityOfItemInBank(
          potion.code,
        );
        if (numInBank < minPotionsToCraft) {
          await this.character.craftNow(
            minPotionsToCraft - numInBank,
            potion.code,
          );
        }
      }
    }

    return true;
  }

  /**
   * Increase the level of a skill by 1, or combat level if no skill passed in
   * @todo Change this so that it only gets a set amount of an item at a time so that the idle task doesn't take a long time.
   *        I would like to have characters check for events and prioritise events over leveling skills so if we spend ~5 hours
   *        leveling a skill then we might miss some important events
   * @param skill the skill to train
   * @returns true if successful
   */
  private async trainSkill(skill: Skill): Promise<boolean> {
    const skillLevel = this.character.getCharacterLevel(
      this.character.data,
      skill,
    );
    const maxLevelGap = 5;

    if (skillLevel === MAX_SKILL_LEVEL) {
      logger.info(
        `Max ${skill} level (${MAX_SKILL_LEVEL}) reached. Not training anymore levels`,
      );
      return true;
    } else if (
      skillLevel >=
      this.character.getCharacterLevel(this.character.data) + maxLevelGap
    ) {
      logger.info(
        `${skill} level (${skillLevel}) is too far ahead of combat level (${this.character.getCharacterLevel(this.character.data)}). Not training ${skill}`,
      );
      return true;
    }

    let job: Objective;
    if (isGatheringSkill(skill)) {
      job = new TrainGatheringSkillObjective(
        this.character,
        skill,
        this.character.getCharacterLevel(this.character.data, skill) + 1,
      );
    } else {
      job = new TrainCraftingSkillObjective(
        this.character,
        'alchemy',
        this.character.getCharacterLevel(this.character.data, skill) + 1,
      );
    }
    return await this.character.executeJobNow(
      job,
      true,
      true,
      this.objectiveId,
    );
  }

  /**
   * The aim of this function is to keep all characters within 10 level of the highest level char
   * This lets us recycle older gear so that it doesn't clog up the bank
   */
  private async checkWithinLevelRange(): Promise<boolean> {
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

  /**
   * @description We can't trade with the Tasks Master until the tasks_farmer achievement is complete
   * This function will ensure that we prioritise doing tasks to get it.
   * @todo Implement this function
   */
  private async completeTasksFarmerAchievement() {
    return true;
  }
}
