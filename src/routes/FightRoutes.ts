import { Router, Request, Response } from "express";
import { CraftObjective } from "../classes/CraftObjectiveClass";
import { Character } from "../classes/CharacterClass";
import { EquipObjective } from "../classes/EquipObjectiveClass";
import { FightObjective } from "../classes/FightObjectiveClass";

export default function fightRouter(char: Character) {
    const router = Router();

    router.post('/', async (req: Request, res: Response) => {
        try {
            const { quantity, itemCode } = req.body

            if (isNaN(quantity) || !itemCode) {
                return res.status(400).json({ error: 'Invalid quantity or itemCode.' });
            }

            if (typeof char === 'undefined' || !char) {
                return res.status(500).json({ error: 'Character instance not available.' });
            }

            const job = new FightObjective(char, {code: itemCode, quantity: quantity});

            char.jobList.push(job);

            return res.status(201).json({ 
                message: 'Fight job added to queue.', 
                job: {
                    id: job.objectiveId,
                    itemCode: job.target.code,
                    quantity: job.target.quantity,
                    status: job.status
                }
            });
        } catch (error) {
            return res.status(500).json({ error: error.message || 'Internal server error.' });
        }
    });

    return router;
}
