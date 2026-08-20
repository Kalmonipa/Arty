import { getItemInformation } from '../api_calls/Items.js';
import { logger } from '../utils.js';
import { Character } from '../character/character.js';
import { ApiError } from '../core/Error.js';
import { Objective } from '../core/Objective.js';
import { getOpenWishlistRequests } from './wishlist.utils.js';
import { AcquisitionMethod } from './wishlist.types.js';
import { eventBlockedIngredients } from '../events/events.cache.js';
import { FulfillWishlistRequestObjective } from './fulfillWishlistRequest.objective.js';
import {
  ObjectiveCancelled,
  ObjectiveCompleted,
  ObjectiveFailed,
  ObjectiveResult,
} from '../types/ObjectiveData.js';
import {
  Alchemy,
  Fishing,
  Gearcrafting,
  Jewelrycrafting,
  Mining,
  Weaponcrafting,
  Woodcutting,
} from '../names.js';

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

  async runPrerequisiteChecks(): Promise<ObjectiveResult> {
    return ObjectiveCompleted;
  }

  /**
   * @description Checks the wishlist for any requests of a certain type
   * Labourers primarily look at mining + woodcutting
   * Crafter looks at weapon/gear/jewelrycrafting
   * Alchemist looks at alchemy
   * Fisherman looks at fishing + cooking
   * @param acquisitionMethod The way to retrieve the requested item
   * @returns the result of identifying and dispatching the requests
   */
  async run(): Promise<ObjectiveResult> {
    if (!(await this.checkStatus())) return ObjectiveCancelled;

    const wishlistRequests = await getOpenWishlistRequests(
      this.acquisitionMethod,
    );

    if (wishlistRequests.length === 0) {
      logger.info(`No ${this.acquisitionMethod} wishlist requests to fulfill`);
      return ObjectiveCompleted;
    }

    for (const request of wishlistRequests) {
      const itemInformation = await getItemInformation(request.item_code);
      if (itemInformation instanceof ApiError) {
        logger.warn(`Item information not found for ${request.item_code}`);
        return ObjectiveFailed;
      }

      logger.debug(
        `Checking ${request.character}s ${request.acquisition_method} request for ${request.quantity}x ${request.item_code} (${itemInformation.level}) `,
      );

      let levelRequired: number;
      switch (this.acquisitionMethod) {
        case Mining:
        case Woodcutting:
        case Fishing:
        case Alchemy:
        case Jewelrycrafting:
        case Gearcrafting:
        case Weaponcrafting:
          levelRequired = this.character.getCharacterLevel(
            this.character.data,
            this.acquisitionMethod,
          );
          break;
        default:
          levelRequired = this.character.getCharacterLevel(this.character.data);
          break;
      }

      if (itemInformation.level > levelRequired) {
        logger.info(
          `Skipping request #${request.id} for ${request.quantity}x ${request.item_code} (${itemInformation.level}) - character level is ${levelRequired}`,
        );
        continue;
      }

      const blockedByEvent = await eventBlockedIngredients(
        request.item_code,
        request.quantity,
        this.character,
      );
      if (blockedByEvent.length > 0) {
        logger.info(
          `Skipping request #${request.id} for ${request.quantity}x ${request.item_code} - ${blockedByEvent.join(', ')} only drops from event content and isn't in the bank`,
        );
        continue;
      }

      logger.info(
        `Executing request #${request.id} for ${request.quantity}x ${request.item_code}`,
      );
      logger.info(
        `Request info: acquisition method: ${request.acquisition_method}, requestor: ${request.character}`,
      );
      const job = new FulfillWishlistRequestObjective(this.character, request);
      const result = await this.character.executeJobNow(
        job,
        true,
        true,
        this.objectiveId,
      );

      if (result.success) {
        logger.info(
          `Crafting ${request.quantity}x ${request.item_code} was successful. Depositing`,
        );
        await this.character.depositNow(request.quantity, request.item_code);
      }
    }

    return ObjectiveCompleted;
  }
}
