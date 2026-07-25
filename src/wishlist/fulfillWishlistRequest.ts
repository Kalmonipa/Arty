import { Character } from '../character/characterClass.js';
import { Objective } from '../core/Objective.js';
import {
  markAsExecuting,
  markAsFulfilled,
  markAsNotExecuting,
} from './functions.js';
import { WishlistRow } from './types.js';

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

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  async run(): Promise<boolean> {
    if (!(await this.checkStatus())) return false;

    await markAsExecuting(this.request.id);

    // Calculate how many inventories full the gather job will be
    // This is to prevent gathering more than the inventory cap and the char endlessly gathers
    const numGatherIterations = Math.ceil(
      this.request.quantity / this.character.data.inventory_max_items,
    );

    let successfull = false;
    try {
      let iterations = 0;
      while (iterations < numGatherIterations) {
        const numToGather = Math.min(
          this.request.quantity,
          Math.round(this.character.data.inventory_max_items * 0.9),
        );
        await this.character.gatherNow(numToGather, this.request.item_code);
        successfull = await this.character.depositNow(
          numToGather,
          this.request.item_code,
        );
        iterations++;
      }
    } finally {
      // Release the request either way: fulfilled if it completed, otherwise
      // cleared of the executing flag so a later cycle can retry it rather
      // than leaving it stranded and blocking any job waiting on it.
      if (successfull) {
        await markAsFulfilled(this.request.id);
      } else {
        await markAsNotExecuting(this.request.id);
      }
    }

    return true;
  }
}
