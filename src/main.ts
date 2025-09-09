import { Character } from './classes/CharacterClass';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';
import express, { Request, Response } from "express";
import gatherRouter from './routes/GatherRoutes';
import depositRouter from './routes/DepositRoutes';
import craftRouter from './routes/CraftRoutes';
import equipRouter from './routes/EquipRoutes';
import fightRouter from './routes/FightRoutes';
import TaskRouter from './routes/TaskRoutes';
import TrainSkillRouter from './routes/TrainSkillRoutes';

async function main() {
  const charData = await getCharacter(CharName);
  const char = new Character(charData);
  await char.init();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use('/craft', craftRouter(char))
  app.use('/deposit', depositRouter(char))
  app.use('/equip', equipRouter(char))
  app.use('/fight', fightRouter(char))
  app.use('/gather', gatherRouter(char))
  app.use('/task', TaskRouter(char))
  app.use('/train', TrainSkillRouter(char))

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

    await char.executeJobList();
  
  
}

main();
