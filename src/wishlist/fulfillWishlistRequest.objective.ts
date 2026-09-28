import { Character } from '../character/character.js';
import { Objective } from '../core/objective.js';
import {
  bankedStockSpokenFor,
  claimWishlistRequest,
  markAsFulfilled,
  markAsNotExecuting,
} from './wishlist.utils.js';
import { AcquisitionMethod, WishlistRow } from './wishlist.types.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';
import { Alchemy, Mining, Woodcutting } from '../gameDataConstants.js';
import { missingIngredientsFor } from './missingIngredients.js';

/**
 * These should be made unconditionally, without checking what's in the bank.
 * Others should factor in the bank i.e. if we request an obsidian helmet but
 * there's already on in the bank then we don't really need another one
 */
const UnconditionalMethods: Set<AcquisitionMethod> = new Set([
  Mining,
  Woodcutting,
  Alchemy,
]);

/**
 * Fulfills the request that gets passed in. Some preliminary checks should have been
 * done via identifyValidWishlistRequests to ensure the character level is high enough
 * etc
 */
export class FulfillWishlistRequestObjective extends Objective {
  request: WishlistRow;

  constructor(character: Character, request: WishlistRow) {
    super(
      character,
      `fulfill_${request.acquisition_method}_request_${request.id}`,
      'not_started',
    );
    this.character = character;
    this.jobFlavour = 'FulfillWishlistRequest';
    this.shouldEmitMetrics = true;
    this.metricLabel = `fulfill_${request.acquisition_method}_request_${request.id}`;
    this.request = request;
  }

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const characterName = this.character.data.name;

    // The request was open when the wishlist was last read, but that may have
    // been a while ago (or another character may have taken it since), so the
    // claim decides whether this character actually works on it.
    if (!(await claimWishlistRequest(this.request.id, characterName))) {
      return ObjectiveCancelled;
    }

    let successfull = false;
    try {
      let outstanding = this.request.quantity;

      if (!UnconditionalMethods.has(this.request.acquisition_method)) {
        const alreadyBanked = await this.character.checkQuantityOfItemInBank(
          this.request.item_code,
        );

        // Banked stock is one pool shared by every open row, so only the part no
        // older request is relying on is this row's to claim
        const spokenFor = await bankedStockSpokenFor(
          this.request.item_code,
          this.request.id,
        );
        const availableToMe = Math.max(0, alreadyBanked - spokenFor);
        outstanding -= availableToMe;

        if (spokenFor > 0) {
          this.log.info(
            `${alreadyBanked}x ${this.request.item_code} banked, ${spokenFor} spoken for by earlier requests; ${availableToMe} available to request #${this.request.id}`,
          );
        }

        if (outstanding <= 0) {
          this.log.info(
            `Request #${this.request.id} for ${this.request.quantity}x ${this.request.item_code} is already covered by the ${availableToMe} in the bank; nothing to make`,
          );
          successfull = true;
          return ObjectiveCompleted;
        }

        if (availableToMe > 0) {
          this.log.info(
            `${availableToMe}x ${this.request.item_code} already banked; making the remaining ${outstanding} for request #${this.request.id}`,
          );
        }
      }

      // Gather in inventory sized batches so a large request doesn't try to
      // carry more than the character can hold
      const batchSize = Math.max(
        1,
        Math.round(this.character.data.inventory_max_items * 0.9),
      );

      while (outstanding > 0) {
        const numToGather = Math.min(outstanding, batchSize);
        await this.character.gatherNow(numToGather, this.request.item_code);
        successfull = (
          await this.character.depositNow(numToGather, this.request.item_code)
        ).success;
        if (!successfull) break;
        outstanding -= numToGather;
      }
    } finally {
      if (successfull) {
        await markAsFulfilled(this.request.id, characterName);
      } else {
        // Released before the diagnostic runs: leaving the row executing would
        // strand it for every character, and the cause is only ever a log line
        await markAsNotExecuting(this.request.id, characterName);
        await this.reportShortfall();
      }
    }

    return successfull ? ObjectiveCompleted : ObjectiveFailed;
  }

  /**
   * @description Says what the request came up short of, so a row that keeps
   * coming back names the thing standing in its way rather than just failing.
   * Diagnostic only: the claim is released either way.
   */
  private async reportShortfall(): Promise<void> {
    const attempted = `${this.request.quantity}x ${this.request.item_code} for request #${this.request.id}`;

    let missing: Awaited<ReturnType<typeof missingIngredientsFor>>;
    try {
      missing = await missingIngredientsFor(
        this.character,
        this.request.item_code,
        this.request.quantity,
      );
    } catch (err) {
      this.log.warn(
        `Could not make ${attempted}; working out why failed: ${err}`,
      );
      return;
    }

    if (missing.length === 0) {
      this.log.warn(
        `Could not make ${this.request.quantity}x ${this.request.item_code} for request #${this.request.id}`,
      );
      return;
    }

    this.log.warn(
      `Could not make ${this.request.quantity}x ${this.request.item_code} for request #${this.request.id}; short of ` +
        missing
          .map(
            (ingredient) =>
              `${ingredient.quantity}x ${ingredient.code} (${ingredient.reason})`,
          )
          .join(', '),
    );
  }
}
