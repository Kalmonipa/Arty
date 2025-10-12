import { Router, Request, Response } from 'express';
import { Character } from '../objectives/Character.js';
import { SimpleItemSchema } from '../types/types.js';

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

      const invItems: SimpleItemSchema[] = [];
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

      const bankItems: SimpleItemSchema[] = await char.getAllBankItems()

      return res.status(201).json({
        message: `There are ${bankItems.length} items in the bank`,
        character: char.data.name,
        bankItems: bankItems,
        numItems: bankItems.length,
      });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error.message || 'Internal server error.' });
    }
  });

  return router;
}
