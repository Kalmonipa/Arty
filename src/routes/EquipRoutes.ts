import { Router, Request, Response } from "express";
import { CraftObjective } from "../classes/CraftObjectiveClass";
import { Character } from "../classes/CharacterClass";
import { EquipObjective } from "../classes/EquipObjectiveClass";

export default function equipRouter(char: Character) {
    const router = Router();

    router.post('/:itemCode', async (req: Request, res: Response) => {
        try {
            const { quantity, itemCode, itemSlot } = req.body

            if (isNaN(quantity) || !itemCode) {
                return res.status(400).json({ error: 'Invalid quantity or itemCode.' });
            }

            if (typeof char === 'undefined' || !char) {
                return res.status(500).json({ error: 'Character instance not available.' });
            }

            const job = new EquipObjective(char, itemCode, itemSlot, quantity);

            char.jobList.push(job);

            return res.status(201).json({ 
                message: 'Gather job added to queue.', 
                job: {
                    id: job.objectiveId,
                    itemCode: job.itemCode,
                    itemSlot: job.itemSlot,
                    quantity: job.quantity,
                    status: job.status
                }
            });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'Internal server error.' });
        }
    });

    return router;
}
