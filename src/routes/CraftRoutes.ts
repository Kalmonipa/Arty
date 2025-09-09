import { Router, Request, Response } from "express";
import { CraftObjective } from "../classes/CraftObjectiveClass";
import { Character } from "../classes/CharacterClass";

export default function craftRouter(char: Character) {
    const router = Router();

    router.post('/:quantity/:itemCode', async (req: Request, res: Response) => {
        try {
            const quantity = parseInt(req.params.quantity, 10);
            const itemCode = req.params.itemCode;

            if (isNaN(quantity) || !itemCode) {
                return res.status(400).json({ error: 'Invalid quantity or itemCode.' });
            }

            if (typeof char === 'undefined' || !char) {
                return res.status(500).json({ error: 'Character instance not available.' });
            }

            const target = {
                code: itemCode,
                quantity: quantity
            };

            const job = new CraftObjective(char, target);

            char.jobList.push(job);

            return res.status(201).json({ 
                message: 'Gather job added to queue.', 
                job: {
                    id: job.objectiveId,
                    target: job.target,
                    status: job.status
                }
            });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'Internal server error.' });
        }
    });

    return router;
}
