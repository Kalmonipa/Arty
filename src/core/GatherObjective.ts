import { actionGather } from '../api_calls/Actions.js';
import { getItemInformation } from '../api_calls/Items.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { WeaponFlavours } from '../types/ItemData.js';
import {
  ObjectiveCancelled,
  ObjectiveFailed,
  ObjectiveResult,
  ObjectiveTargets,
} from '../types/ObjectiveData.js';
import {
  StaticDataPageMonsterSchema,
  ItemSchema,
  MapSchema,
  SimpleItemSchema,
} from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from './Error.js';
import { Objective } from './Objective.js';
import { selectResourceNode } from './resourceNodeSelection.js';
import { selectMobsForDrop } from './monsterSelection.js';
import { isEventOnlyDrop } from '../events/events.cache.js';
import { Sap } from '../names.js';

export class GatherObjective extends Objective {
  target: ObjectiveTargets;
  checkBank?: boolean;
  includeInventory?: boolean;

  constructor(
    character: Character,
    target: ObjectiveTargets,
    checkBank?: boolean,
    includeInventory?: boolean,
  ) {
    super(character, `gather_${target.quantity}_${target.code}`, 'not_started');
    this.character = character;
    this.jobFlavour = 'Gather';
    this.target = target;
    this.shouldEmitMetrics = true;
    this.metricLabel = target.code;
    this.checkBank = checkBank;
    this.includeInventory =
      includeInventory !== undefined ? includeInventory : true;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * This method figures out how many we have in our inventory and in the bank
   * Then calls gather() to retrieve the remaining amount
   * @returns true if successful, false if failure
   */
  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    let numInInv = 0;
    let numInBank = 0;
    this.progress = 0;

    if (this.target.code === 'wooden_stick') {
      logger.info(`${this.target.code} is not gatherable`);
      return ObjectiveFailed;
    }

    if (this.includeInventory) {
      numInInv = this.character.checkQuantityOfItemInInv(this.target.code);
    }
    // Sometimes we want to collect a bunch of the resource so we should skip checking the bank
    // Other times we want to gather stuff to then craft so taking from the bank is OK
    if (this.checkBank) {
      numInBank = await this.character.checkQuantityOfItemInBank(
        this.target.code,
      );
    }

    // Calculate total available items
    const totalAvailable = numInInv + numInBank;

    // If we already have enough, we're done
    if (totalAvailable >= this.target.quantity) {
      if (this.includeInventory && numInInv >= this.target.quantity) {
        logger.info(
          `${numInInv} ${this.target.code} in inventory already. No need to collect more`,
        );
        return { complete: true, success: true, reason: 'complete' };
      } else {
        // Need to withdraw from bank
        const needToWithdraw = Math.max(this.target.quantity - numInInv, 0);
        logger.info(
          `Found ${numInBank} ${this.target.code} in the bank. Withdrawing ${needToWithdraw}`,
        );
        return await this.character.withdrawNow(
          needToWithdraw,
          this.target.code,
        );
      }
    }

    // Withdraw what we can from bank first
    if (numInBank > 0) {
      logger.info(
        `Withdrawing ${numInBank} ${this.target.code} from the bank. Need to gather ${this.target.quantity - numInBank - numInInv} more`,
      );
      await this.character.withdrawNow(numInBank, this.target.code);
    }

    // Calculate how many we still need to gather
    const currentTotal = this.character.checkQuantityOfItemInInv(
      this.target.code,
    );
    const amountStillNeeded = this.target.quantity - currentTotal;

    if (amountStillNeeded <= 0) {
      logger.info(
        `Already have enough ${this.target.code} after bank withdrawal`,
      );
      return { complete: true, success: true, reason: 'complete' };
    }

    logger.info(`Need to gather ${amountStillNeeded} more ${this.target.code}`);

    return await this.gather(amountStillNeeded, this.target.code);
  }

  /**
   * @description Holds the logic for finding the resource map and gathering the resource
   * @param quantity target number to gather
   * @param code item code of the resource to gather
   * @param maxRetries number of retries before failing the job. Defaults to 3
   * @returns true if successful, false if not
   */
  async gather(
    quantity: number,
    code: string,
    maxRetries: number = 3,
  ): Promise<ObjectiveResult> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (!(await this.checkStatus())) return ObjectiveCancelled;
      logger.info(`Gather attempt ${attempt}/${maxRetries}`);

      // Check our equipment to see if we can equip something useful
      const resourceDetails: ItemSchema | ApiError =
        await getItemInformation(code);
      if (resourceDetails instanceof ApiError) {
        const shouldRetry = await this.character.handleErrors(resourceDetails);

        if (!shouldRetry || attempt === maxRetries) {
          logger.error(`Gather failed after ${attempt} attempts`);
          return ObjectiveFailed;
        }
        continue;
      } else if (await isEventOnlyDrop(code, this.character)) {
        logger.warn(
          `${code} only drops from event content, which isn't reliably available. Failing`,
        );
        return ObjectiveFailed;
      } else if (isGatheringSkill(resourceDetails.subtype)) {
        await this.character.evaluateGear(
          resourceDetails.subtype as WeaponFlavours,
          undefined,
          code,
        );
      }

      // Evaluate our inventory space before we start collecting items
      // If the amount to gather is more than our inventory can handle we will drop off all items
      // If not, then we keep the target item
      const itemsToKeep =
        this.target.quantity < this.character.data.inventory_max_items
          ? [code]
          : [];

      await this.character.evaluateDepositItemsInBank(itemsToKeep);

      if (resourceDetails.subtype === 'mob') {
        if (
          !(
            await this.gatherMobDrop({
              code: resourceDetails.code,
              quantity: quantity,
            })
          ).success
        ) {
          continue;
        } else {
          return { complete: true, success: true, reason: 'complete' };
        }
      } else if (
        resourceDetails.subtype === 'task' ||
        resourceDetails.subtype === 'npc'
      ) {
        if (
          !(
            await this.character.tradeWithNpcNow(
              'buy',
              quantity,
              resourceDetails.code,
            )
          ).success
        ) {
          continue;
        } else {
          return { complete: true, success: true, reason: 'complete' };
        }
      } else if (resourceDetails.craft && resourceDetails.code !== Sap) {
        if (
          !(
            await this.character.craftNow(
              quantity,
              resourceDetails.code,
              false,
              false,
            )
          ).success
        ) {
          continue;
        } else {
          return { complete: true, success: true, reason: 'complete' };
        }
      } else {
        if (!(await this.gatherResource(code, quantity, itemsToKeep)).success) {
          continue;
        } else {
          return { complete: true, success: true, reason: 'complete' };
        }
      }
    }

    logger.error(`Gather failed after ${maxRetries} attempts`);
    return ObjectiveFailed;
  }

  async gatherItemLoop(
    location: MapSchema,
    itemsToKeep?: string[],
  ): Promise<ObjectiveResult> {
    const baselineInventory = this.includeInventory
      ? 0
      : this.character.checkQuantityOfItemInInv(this.target.code);

    let iteration = 0;
    while (this.progress < this.target.quantity) {
      if (iteration % 5 === 0) {
        const held =
          this.character.checkQuantityOfItemInInv(this.target.code) -
          baselineInventory;
        const banked = this.checkBank
          ? await this.character.checkQuantityOfItemInBank(this.target.code)
          : 0;
        this.progress = held + banked;

        logger.info(
          `Gathered ${this.progress}/${this.target.quantity} ${this.target.code}`,
        );

        if (this.progress >= this.target.quantity) break;

        // Check this during gathering jobs so we don't miss out
        if (this.character.enableEvents) {
          await this.character.checkForActiveEvents();
        }

        // ToDo: remove this log once debugging is done
        logger.info(`Checking for boss fights`);
        await this.character.checkForBossFightParticipation();
      }

      // Check inventory space to make sure we are less than 90% full
      await this.character.evaluateDepositItemsInBank(itemsToKeep, location);

      const response = await actionGather(this.character.data);

      if (response instanceof ApiError) {
        await this.character.handleErrors(response);
        return ObjectiveFailed;
      } else {
        if (response && response.data && response.data.character) {
          this.character.data = response.data.character;
        } else {
          logger.error(
            'Invalid response structure from actionGather:',
            response,
          );
          return ObjectiveFailed;
        }
      }

      if (!(await this.checkStatus())) return ObjectiveCancelled;
      ObjectiveCancelled;
      await this.character.saveJobQueue();
      iteration++;
    }

    return { complete: true, success: true, reason: 'complete' };
  }

  /**
   * @description Farms a mob for one of its drops. `target.quantity` is the
   * shortfall run() worked out, but progress is measured the same way as
   * gatherItemLoop does — the stock actually held against the job's target — so
   * it lines up with what the character is carrying instead of counting only
   * the drops from this run.
   *
   * Droppers are tried fastest first, moving on to the next one whenever a fight
   * fails, so a mob the character cannot beat doesn't sink a drop another mob
   * also yields.
   * @param target The drop to farm; its code decides which mobs to fight
   * @returns true once the target is met, false once the droppers run out or the job stopped
   */
  async gatherMobDrop(target: SimpleItemSchema): Promise<ObjectiveResult> {
    const mobInfo: StaticDataPageMonsterSchema | ApiError =
      await getAllMonsterInformation({
        drop: target.code,
        max_level: this.character.data.level,
      });
    if (mobInfo instanceof ApiError) {
      await this.character.handleErrors(mobInfo);
      return ObjectiveFailed;
    } else if (mobInfo.data.length === 0) {
      logger.error(`Found no mobs for drop ${target.code}`);
      return ObjectiveFailed;
    } else {
      const droppers = await selectMobsForDrop(
        mobInfo.data,
        this.character,
        target.code,
      );

      if (droppers.length === 0) {
        logger.error(
          `Nothing farmable drops ${target.code}. The only droppers are bosses or event mobs`,
        );
        return ObjectiveFailed;
      }

      const baselineInventory = this.includeInventory
        ? 0
        : this.character.checkQuantityOfItemInInv(this.target.code);

      // An outer job may already be keeping this drop, in which case it owns the
      // entry and we must leave it behind when we're done
      const keptByOuterJob = !!this.character.itemsToKeep?.includes(
        this.target.code,
      );
      this.character.addItemToItemsToKeep(this.target.code);

      let dropperIndex = 0;

      try {
        while (this.progress < this.target.quantity) {
          const held =
            this.character.checkQuantityOfItemInInv(this.target.code) -
            baselineInventory;
          const banked = this.checkBank
            ? await this.character.checkQuantityOfItemInBank(this.target.code)
            : 0;
          this.progress = held + banked;

          logger.info(
            `Gathered ${this.progress}/${this.target.quantity} ${this.target.code}`,
          );

          if (this.progress >= this.target.quantity) break;

          const dropper = droppers[dropperIndex];

          if (!(await this.character.fightNow(10, dropper.code)).success) {
            logger.debug(`Fight attempt against ${dropper.code} failed`);

            dropperIndex++;
            if (dropperIndex >= droppers.length) {
              logger.warn(
                `Ran out of mobs to farm ${target.code} from after ${dropper.code}`,
              );
              return ObjectiveFailed;
            }

            logger.info(
              `Trying ${droppers[dropperIndex].code} for ${target.code} instead`,
            );
            continue;
          }

          if (!(await this.checkStatus())) return ObjectiveCancelled;

          await this.character.saveJobQueue();
        }
        return { complete: true, success: true, reason: 'complete' };
      } finally {
        if (!keptByOuterJob) {
          this.character.removeItemFromItemsToKeep(this.target.code);
        }
      }
    }
  }

  /**
   * gathers the requested resource
   * @param code item code to gather
   * @param quantity number of items to gather
   * @param itemsToKeep items to keep in inventory
   * @returns true if successful, false if not
   */
  async gatherResource(
    code: string,
    quantity: number,
    itemsToKeep?: string[],
  ): Promise<ObjectiveResult> {
    logger.debug(`Finding resource map type for ${code}`);

    const resources = await getAllResourceInformation({
      drop: code,
    });
    if (resources instanceof ApiError) {
      await this.character.handleErrors(resources);
      return ObjectiveFailed;
    }

    logger.debug(`Finding best resource to gather`);
    // skillNeeded and levelNeeded tell the wishlist what the character checking it
    // needs to fulfil the request when we can't gather the resource ourselves
    const { resource, skillNeeded, levelNeeded } = selectResourceNode(
      resources.data,
      this.character,
      code,
    );

    if (!resource) {
      logger.warn(
        `${this.character.data.name} ${skillNeeded} level is not high enough to gather ${code}`,
      );
      await this.requestIngredientFromWishlist(
        { code, quantity },
        { acquisitionMethod: skillNeeded, minLevel: levelNeeded },
      );
      return ObjectiveFailed;
    }

    logger.info(`Finding location of ${resource.code}`);

    const maps = this.character.findMaps({ content_code: resource.code });
    if (maps.length === 0) {
      logger.error(`Cannot find any maps for ${resource.code}`);
      return ObjectiveFailed;
    }

    const contentLocation = this.character.evaluateClosestMap(maps);
    await this.character.move(contentLocation);

    const success = await this.gatherItemLoop(contentLocation, itemsToKeep);

    if (!(await this.checkStatus())) return ObjectiveCancelled;

    if (this.progress >= this.target.quantity) {
      logger.info(`Successfully gathered ${this.progress} ${code}`);
      return { complete: true, success: true, reason: 'complete' };
    } else {
      logger.warn(
        `Only gathered ${this.progress}/${this.target.quantity} ${code}. We should gather more`,
      );
      return {
        complete: true,
        success: success.success,
        reason: success.reason,
      }; // Return the result from gatherItemLoop
    }
  }
}
