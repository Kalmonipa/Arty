import { Router, Request, Response } from 'express';
import { Character } from '../character/characterClass.js';
import { logger } from '../utils.js';
import { addToWishlist } from './functions.js';
import { WishlistRequest } from './types.js';

export default function WishlistRouter(char: Character) {
  const router = Router();

  /**
   * Adds an event rule for the specified event for the specified character
   */
  router.post('/add', async (req: Request, res: Response) => {
    const body = req.body as Partial<WishlistRequest>;

    if (
      typeof body.itemCode !== 'string' ||
      typeof body.quantity !== 'number'
    ) {
      return res.status(400).json({
        error: 'itemCode (string) and quantity (number) are required',
      });
    }

    const wishlistInfo: WishlistRequest = {
      itemCode: body.itemCode,
      quantity: body.quantity,
      characterName: char.data.name,
      minLevel: body.minLevel,
      maxLevel: body.maxLevel,
      expirationDate: body.expirationDate,
      cost: body.cost,
      currency: body.currency,
      acquisitionMethod: body.acquisitionMethod,
    };

    const success = await addToWishlist(wishlistInfo);
    if (!success) {
      return res.status(500).json({ error: 'Failed to add to wishlist' });
    }

    const message = `Added ${wishlistInfo.quantity}x ${wishlistInfo.itemCode} to the wishlist`;
    logger.info(message);
    return res.json({ message });
  });

  return router;
}
