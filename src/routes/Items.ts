import { Router, Request, Response } from 'express';
import { Character } from '../objectives/Character.js';
import { DataPageSimpleItemSchema, SimpleItemSchema } from '../types/types.js';
import { getBankItems } from '../api_calls/Bank.js';
import { ApiError } from '../objectives/Error.js';

export default function ItemsRouter(char: Character) {
  const router = Router();

  /**
   * @description a list of all items in the characters inventory
   * @param char
   */
  router.get('/inventory', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let invItems: SimpleItemSchema[] = [];
      for (const item of char.data.inventory) {
        if (item.quantity > 0) {
          invItems.push({ code: item.code, quantity: item.quantity });
        }
      }

      return res.status(201).json({
        message: `${char.data.name} has ${invItems.length} items in their inventory`,
        character: char.data.name,
        invItems: invItems,
        numItems: invItems.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  /**
   * @description a list of all items in the bank
   * @param char
   */
  router.get('/bank', async (req: Request, res: Response) => {
    try {
      if (typeof char === 'undefined' || !char) {
        return res
          .status(500)
          .json({ error: 'Character instance not available.' });
      }

      let bankItems: DataPageSimpleItemSchema | ApiError = await getBankItems(
        undefined,
        undefined,
        100,
      );
      if (bankItems instanceof ApiError) {
        return res.status(bankItems.error.code).json(bankItems.error);
      }

      return res.status(201).json({
        message: `There are ${bankItems.data.length} items in the bank`,
        character: char.data.name,
        bankItems: bankItems.data,
        numItems: bankItems.data.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
