import { actionGather } from '../api_calls/Actions.js';
import { getItemInformation } from '../api_calls/Items.js';
import { getAllMonsterInformation } from '../api_calls/Monsters.js';
import { getAllResourceInformation } from '../api_calls/Resources.js';
import { WeaponFlavours } from '../types/ItemData.js';
import { ObjectiveTargets } from '../types/ObjectiveData.js';
import {
  StaticDataPageMonsterSchema,
  ItemSchema,
  MapSchema,
  SimpleItemSchema,
  GatheringSkill,
} from '../types/types.js';
import { isGatheringSkill, logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import {
  addToWishlist,
  getOpenWishlistRequests,
  markAsExecuting,
  markAsFulfilled,
} from '../wishlist/functions.js';
import { AcquisitionMethod } from './types.js';

export class FulfillWishlistRequestObjective extends Objective {
  acquisitionMethod: AcquisitionMethod;

  constructor(character: Character, acquisitionMethod: AcquisitionMethod) {
    super(character, `fulfill_${acquisitionMethod}_requests`, 'not_started');
    this.character = character;
    this.jobFlavour = 'FulfillWishlistRequest';
    this.shouldEmitMetrics = true;
    this.metricLabel = `fulfill_${acquisitionMethod}_requests`;
    this.acquisitionMethod = acquisitionMethod;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * Checks the wishlist for any wishlist requests of the type specified
   * and fulfills them if able
   */
  async run(): Promise<boolean> {
    if (!(await this.checkStatus())) return false;

    /**
     * @description Checks the wishlist for any requests of a certain type
     * Labourers primarily look at mining + woodcutting
     * Crafter looks at weapon/gear/jewelrycrafting
     * Alchemist looks at alchemy
     * Fisherman looks at fishing + cooking
     * @param acquisitionMethod The way to retrieve the requested item
     * @returns true if successful, false if encounter some failure along the way
     */

    const wishlistRequests = await getOpenWishlistRequests(
      this.acquisitionMethod,
    );

    if (wishlistRequests.length === 0) {
      logger.info(`No ${this.acquisitionMethod} wishlist requests to fulfill`);
      return true;
    }

    for (const request of wishlistRequests) {
      const itemInformation = await getItemInformation(request.item_code);
      if (itemInformation instanceof ApiError) {
        logger.warn(`Item information not found for ${request.item_code}`);
        return false;
      }

      if (
        itemInformation.level <
        this.character.getCharacterLevel(this.character.data)
      ) {
        await markAsExecuting(request.id);

        // Calculate how many inventories full the gather job will be
        // This is to prevent gathering more than the inventory cap and the char endlessly gathers
        const numGatherIterations = Math.ceil(
          request.quantity / this.character.data.inventory_max_items,
        );

        let iterations = 0;
        let successfull = false;
        while (iterations < numGatherIterations) {
          const numToGather = Math.min(
            request.quantity,
            Math.round(this.character.data.inventory_max_items * 0.95),
          );
          await this.character.gatherNow(numToGather, request.item_code);
          successfull = await this.character.depositNow(
            numToGather,
            request.item_code,
          );
          iterations++;
        }
        if (successfull) {
          await markAsFulfilled(request.id);
        }
      }
    }

    return true;
  }
}
