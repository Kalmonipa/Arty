import { getItemInformation } from '../api_calls/Items.js';
import { logger } from '../utils.js';
import { Character } from '../character/characterClass.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { getOpenWishlistRequests } from './functions.js';
import { AcquisitionMethod } from './types.js';
import { FulfillWishlistRequestObjective } from './fulfillWishlistRequest.js';

export class IdentifyValidWishlistRequestsObjective extends Objective {
  acquisitionMethod: AcquisitionMethod;

  constructor(character: Character, acquisitionMethod: AcquisitionMethod) {
    super(character, `check_${acquisitionMethod}_requests`, 'not_started');
    this.character = character;
    this.jobFlavour = 'IdentifyValidWishlistRequests';
    this.shouldEmitMetrics = true;
    this.metricLabel = `check_${acquisitionMethod}_requests`;
    this.acquisitionMethod = acquisitionMethod;
  }

  async runPrerequisiteChecks(): Promise<boolean> {
    return true;
  }

  /**
   * @description Checks the wishlist for any requests of a certain type
   * Labourers primarily look at mining + woodcutting
   * Crafter looks at weapon/gear/jewelrycrafting
   * Alchemist looks at alchemy
   * Fisherman looks at fishing + cooking
   * @param acquisitionMethod The way to retrieve the requested item
   * @returns true if successful, false if encounter some failure along the way
   */
  async run(): Promise<boolean> {
    if (!(await this.checkStatus())) return false;

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
        logger.info(
          `Executing request #${request.id} for ${request.quantity}x ${request.item_code}`,
        );
        logger.info(
          `Request info: acquisition method: ${request.acquisition_method}, requestor: ${request.character}`,
        );
        const job = new FulfillWishlistRequestObjective(
          this.character,
          request,
        );
        await this.character.executeJobNow(job, true, true, this.objectiveId);
      }
    }

    return true;
  }
}
