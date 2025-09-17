import { Character } from './classes/Character';
import { getCharacter } from './api_calls/Character';
import express from 'express';
import GatherRouter from './routes/Gather';
import TaskRouter from './routes/Task';
import TrainSkillRouter from './routes/TrainSkill';
import { ApiUrl, CharName, logger } from './utils';
import JobsRouter from './routes/Jobs';
import CraftRouter from './routes/Craft';
import DepositRouter from './routes/Deposit';
import EquipRouter from './routes/Equip';
import FightRouter from './routes/Fight';
import RecycleRouter from './routes/Recycle';

async function main() {
  const charData = await getCharacter(CharName);
  const char = new Character(charData);
  await char.init();

  if (ApiUrl === 'https://api-test.artifactsmmo.com') {
    logger.info(`-- Using Test server --`);
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use('/craft', CraftRouter(char));
  app.use('/deposit', DepositRouter(char));
  app.use('/equip', EquipRouter(char));
  app.use('/fight', FightRouter(char));
  app.use('/gather', GatherRouter(char));
  app.use('/jobs', JobsRouter(char));
  app.use('/recycle', RecycleRouter(char));
  app.use('/task', TaskRouter(char));
  app.use('/train', TrainSkillRouter(char));

  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  char.executeJobList();
}

main();
