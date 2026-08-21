import { Character } from '../character/character.js';
import { Objective } from '../core/Objective.js';
import {
  claimWishlistRequest,
  markAsFulfilled,
  markAsNotExecuting,
} from './wishlist.utils.js';
import { WishlistRow } from './wishlist.types.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveResult,
} from '../types/ObjectiveData.js';

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
      const alreadyBanked = await this.character.checkQuantityOfItemInBank(
        this.request.item_code,
      );
      let outstanding = this.request.quantity - alreadyBanked;

      if (outstanding <= 0) {
        this.log.info(
          `Request #${this.request.id} for ${this.request.quantity}x ${this.request.item_code} is already covered by the ${alreadyBanked} in the bank; nothing to make`,
        );
        successfull = true;
        return ObjectiveCompleted;
      }

      if (alreadyBanked > 0) {
        this.log.info(
          `${alreadyBanked}x ${this.request.item_code} already banked; making the remaining ${outstanding} for request #${this.request.id}`,
        );
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
        await markAsNotExecuting(this.request.id, characterName);
      }
    }

    return ObjectiveCompleted;
  }
}
