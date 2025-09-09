import { Router, Request, Response } from "express";
import { Character } from "../classes/CharacterClass";
import { DepositObjective } from "../classes/DepositObjectiveClass";

export default function depositRouter(char: Character) {
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

            const depositJob = new DepositObjective(char, target);

            char.jobList.push(depositJob);

            return res.status(201).json({ 
                message: 'Deposit job added to queue.', 
                job: {
                    id: depositJob.objectiveId,
                    target: depositJob.target,
                    status: depositJob.status
                }
            });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'Internal server error.' });
        }
    });

    return router;
}
